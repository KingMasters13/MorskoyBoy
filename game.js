(function() {
    "use strict";

    var presenceChannel = null;
    var gameChannel = null;
    var current_game = null;
    var isPlayer1 = false;
    var myShips = [];
    var boardGrid = [];
    var placementMode = true;

    const BOARD_SIZE = 10;
    const SHIP_CONFIG = [
        { size: 4, count: 1, name: "Линкор" },
        { size: 3, count: 2, name: "Крейсер" },
        { size: 2, count: 3, name: "Эсминец" },
        { size: 1, count: 4, name: "Катер" }
    ];

    const authSection = document.getElementById('auth-section');
    const gameSection = document.getElementById('game-section');
    const myBoardElement = document.getElementById('my-board');
    const opponentBoardElement = document.getElementById('opponent-board');
    const opponentBoardWrapper = document.getElementById('opponent-board-wrapper');
    const boardsContainer = document.getElementById('boards-container');
    const placementTools = document.getElementById('placement-tools');
    const startBattleButton = document.getElementById('start-battle-button');
    const turnIndicator = document.getElementById('turn-indicator');
    const playersListCard = document.getElementById('players-list-card');
    const activeGameInfo = document.getElementById('active-game-info');
    const gameFinishCard = document.getElementById('game-finish-card');
    const randomPlacementButton = document.getElementById('random-placement-button');
    const authMessage = document.getElementById('auth-message'); 

    document.getElementById('signin-button').addEventListener('click', handleSignIn);
    document.getElementById('signup-button').addEventListener('click', handleSignUp);
    document.getElementById('logout-button').addEventListener('click', logout);
    document.getElementById('back-to-lobby-button').addEventListener('click', showLobby);
    if (randomPlacementButton) randomPlacementButton.addEventListener('click', placeShipsRandomly);


    async function handleSignIn() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            authMessage.textContent = "Введите имя и пароль для входа.";
            return;
        }

        const email = `${username}@battleship.com`; 

        try {
            authMessage.textContent = 'Попытка входа...';
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) throw error;

            authMessage.textContent = 'Успешный вход!';
            initializeUser(data.user);

        } catch (error) {
            let displayMessage = `Ошибка входа: ${error.message}.`;
            if (error.status === 400 && error.message === 'Invalid login credentials') {
                 displayMessage = 'Ошибка входа: Неверное имя пользователя или пароль. Проверьте введенные данные.';
            } else {
                 displayMessage += ' Проверьте ключи и настройки Supabase.';
            }
            authMessage.textContent = displayMessage;
            console.error("Auth Error (Sign In):", error);
        }
    }

    async function handleSignUp() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            authMessage.textContent = "Введите имя и пароль для регистрации.";
            return;
        }
        
        const email = `${username}@battleship.com`; 

        try {
            authMessage.textContent = 'Попытка регистрации...';
            const { data, error } = await supabase.auth.signUp({ 
                email, 
                password, 
                options: { 
                    data: { username: username } 
                } 
            });

            if (error) throw error;
            
            if (data.user && data.user.aud === 'authenticated') {
                 authMessage.textContent = 'Регистрация успешна! Вы вошли в систему.';
                 initializeUser(data.user);
            } else if (data.session === null) {
                 authMessage.textContent = 'Регистрация успешна. Проверьте почту для подтверждения (если включено).';
            } else {
                 authMessage.textContent = 'Регистрация успешна! Вы вошли в систему.';
                 initializeUser(data.user);
            }

        } catch (error) {
            let displayMessage = `Ошибка регистрации: ${error.message}.`;
            authMessage.textContent = displayMessage;
            console.error("Auth Error (Sign Up):", error);
        }
    }

    function initializeUser(user) {
        if (!user) {
            window.myUserId = null;
            window.myUsername = null;
            authSection.style.display = 'block';
            gameSection.style.display = 'none';
            return;
        }

        window.myUserId = user.id;
        window.myUsername = user.user_metadata?.username || user.email.split('@')[0]; 

        document.getElementById('current-username').textContent = window.myUsername;
        document.getElementById('current-user-id').textContent = window.myUserId.substring(0, 8) + '...';
        
        authSection.style.display = 'none';
        gameSection.style.display = 'block';

        checkActiveGame();
        subscribeToPresence();
    }

    async function logout() {
        if (gameChannel) await supabase.removeChannel(gameChannel);
        if (presenceChannel) await supabase.removeChannel(presenceChannel);

        await supabase.auth.signOut();
        window.myUserId = null;
        window.myUsername = null;
        current_game = null;
        showLobby();
        initializeUser(null);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            initializeUser(session.user);
        } else {
            initializeUser(null);
        }
    });

    function subscribeToPresence() {
        if (presenceChannel) supabase.removeChannel(presenceChannel);
        
        presenceChannel = supabase.channel('online_players', {
            config: { presence: { key: window.myUserId } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const players = Object.keys(state)
                    .filter(id => id !== window.myUserId)
                    .map(id => state[id][0].username);

                updatePlayersList(players);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ username: window.myUsername }); 
                }
            });
    }

    function updatePlayersList(players) {
        const list = document.getElementById('online-players-list');
        list.innerHTML = '';
        
        if (players.length === 0) {
            list.innerHTML = '<li>Нет других игроков онлайн.</li>';
            return;
        }

        players.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            if (current_game === null) {
                const challengeBtn = document.createElement('button');
                challengeBtn.textContent = 'Вызвать на бой ⚔️';
                challengeBtn.className = 'challenge-button';
                challengeBtn.onclick = () => createGame(name);
                li.appendChild(challengeBtn);
            }
            list.appendChild(li);
        });
    }

    async function checkActiveGame() {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .or(`player1_id.eq.${window.myUserId},player2_id.eq.${window.myUserId}`)
            .not('status', 'in.("finished", "abandoned")')
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("Ошибка проверки активной игры (RLS SELECT?):", error);
            return;
        }

        if (data) {
            document.getElementById('return-to-game-card').style.display = 'block';
            document.getElementById('return-to-game-button').onclick = () => joinGame(data.id);
        } else {
            document.getElementById('return-to-game-card').style.display = 'none';
        }
    }

    async function createGame(opponentName) {
        const { data: opponentData } = await supabase
            .from('users')
            .select('id')
            .eq('raw_user_meta_data->>username', opponentName)
            .limit(1);

        if (!opponentData || opponentData.length === 0) {
            alert("Противник не найден. Возможно, он вышел из сети.");
            return;
        }
        const opponentId = opponentData[0].id;
        
        const { data: game, error: createError } = await supabase
            .from('games')
            .insert({
                player1_id: window.myUserId,
                player1_name: window.myUsername,
                player2_id: opponentId,
                player2_name: opponentName,
                status: 'lobby',
                current_turn: null
            })
            .select()
            .single();

        if (createError) {
            alert(`Ошибка при создании игры. Проверьте RLS INSERT или наличие колонок: ${createError.message}`); 
            console.error("Ошибка создания игры:", createError);
            return;
        }

        joinGame(game.id);
    }

    async function joinGame(gameId) {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .eq('id', gameId)
            .limit(1);

        if (error || !data || data.length === 0) {
            alert("Не удалось найти игру или получить данные (Ошибка RLS SELECT)."); 
            console.error("Ошибка SELECT при присоединении:", error || { message: "Игра не найдена." });
            return;
        }

        const game = data[0];
        current_game = game;
        isPlayer1 = game.player1_id === window.myUserId;

        showGameUI();
        
        if (gameChannel) await supabase.removeChannel(gameChannel);

        gameChannel = supabase.channel(`game_${gameId}`);
        
        gameChannel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
            (payload) => {
                current_game = payload.new;
                updateGameUI(current_game);
            }
        ).subscribe();
        
        updateGameUI(current_game);
    }

    function showLobby() {
        boardsContainer.style.display = 'none';
        activeGameInfo.style.display = 'none';
        playersListCard.style.display = 'block';
        gameFinishCard.style.display = 'none';
        
        if (gameChannel) supabase.removeChannel(gameChannel);
        
        current_game = null;
        myBoardElement.innerHTML = '';
        opponentBoardElement.innerHTML = '';
        
        subscribeToPresence();
        checkActiveGame();
    }


    function showGameUI() {
        playersListCard.style.display = 'none';
        document.getElementById('return-to-game-card').style.display = 'none';
        gameFinishCard.style.display = 'none';
        
        activeGameInfo.style.display = 'block';
        boardsContainer.style.display = 'block';
        opponentBoardWrapper.style.display = 'none';
        
        const opponentName = isPlayer1 ? current_game.player2_name : current_game.player1_name;
        document.getElementById('game-id-display').textContent = current_game.id.substring(0, 8) + '...';
        document.getElementById('opponent-name-display').textContent = opponentName;

        initializeBoard(myBoardElement, true);
        initializeBoard(opponentBoardElement, false);
    }

    function updateGameUI(game) {
        document.getElementById('game-status-display').textContent = game.status;
        const opponentBoardData = isPlayer1 ? game.player2_board : game.player1_board;
        const myBoardData = isPlayer1 ? game.player1_board : game.player2_board;
        
        const myTurn = game.current_turn === window.myUserId;
        
        if (game.status === 'lobby' || game.status === 'placement') {
            placementMode = true;
            
            if (myBoardData === null) {
                placementTools.style.display = 'flex';
                document.getElementById('boards-title').textContent = '🛥️ Расстановка кораблей';
                renderShipList();
                
                const opponentReady = opponentBoardData !== null;
                turnIndicator.textContent = opponentReady 
                    ? '✅ Соперник расставил корабли. Ждём вас!' 
                    : '🟡 Расставьте корабли и нажмите "ГОТОВ!".';
            } else {
                placementTools.style.display = 'none';
                document.getElementById('boards-title').textContent = 'Ожидание соперника...';
                const opponentReady = opponentBoardData !== null;
                turnIndicator.textContent = opponentReady 
                    ? '✅ Оба готовы! Ожидание начала боя...'
                    : '⏱️ Вы готовы. Ожидаем, пока соперник расставит корабли.';
            }
            
            if (myBoardData !== null) {
                 updateBoardDisplay(myBoardElement, myBoardData, true);
            } else {
                 generateInitialBoardGrid(); 
                 updateBoardDisplay(myBoardElement, boardGrid, true);
            }

        } else if (game.status === 'battle') {
            placementMode = false;
            placementTools.style.display = 'none';
            opponentBoardWrapper.style.display = 'block';
            document.getElementById('boards-title').textContent = 'Сражение!';

            updateBoardDisplay(myBoardElement, myBoardData, true);
            updateBoardDisplay(opponentBoardElement, opponentBoardData, false);
            
            myBoardElement.classList.toggle('turn-highlight', !myTurn);
            opponentBoardElement.classList.toggle('turn-highlight', myTurn);

            if (myTurn) {
                turnIndicator.innerHTML = '🔥 **ВАШ ХОД!** Атакуйте поле противника.';
                opponentBoardElement.classList.add('attack-mode');
            } else {
                turnIndicator.innerHTML = '⏱️ Ход противника. Ожидайте атаки.';
                opponentBoardElement.classList.remove('attack-mode');
            }

        } else if (game.status === 'finished') {
            handleGameFinished(game);
        }
    }


    function initializeBoard(boardElement, isMyBoard) {
        boardElement.innerHTML = '';
        const letters = [' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        for (let i = 0; i <= BOARD_SIZE; i++) {
            for (let j = 0; j <= BOARD_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                
                if (i === 0 && j === 0) cell.className = 'cell coord';
                else if (i === 0) {
                    cell.textContent = letters[j];
                    cell.className = 'cell coord';
                } else if (j === 0) {
                    cell.textContent = i;
                    cell.className = 'cell coord';
                } else {
                    cell.dataset.row = i;
                    cell.dataset.col = j;
                    if (!isMyBoard) cell.addEventListener('click', handleShot);
                }
                boardElement.appendChild(cell);
            }
        }
    }


    function updateBoardDisplay(boardElement, boardData, isMyBoard) {
        if (!boardData) return;

        boardElement.querySelectorAll('.ship-overlay').forEach(el => el.remove());
        boardElement.querySelectorAll('.cell-ship-placed').forEach(el => el.classList.remove('cell-ship-placed'));


        for (let i = 1; i <= BOARD_SIZE; i++) {
            for (let j = 1; j <= BOARD_SIZE; j++) {
                const cell = boardElement.querySelector(`[data-row="${i}"][data-col="${j}"]`);
                if (!cell) continue;

                cell.className = 'cell'; 
                const cellState = boardData[i][j];

                if (isMyBoard) {
                    if (cellState.ship && !cellState.hit) cell.classList.add('cell-ship-placed');
                    if (cellState.ship && cellState.hit) cell.classList.add('hit-ship');
                }

                if (cellState.hit) cell.classList.add('hit');
                else if (cellState.miss) cell.classList.add('miss');

                if (cellState.lastBomb) cell.classList.add('last-bomb');
                else cell.classList.remove('last-bomb');
                
                if (!isMyBoard) {
                    const isFired = cellState.hit || cellState.miss;
                    const isMyTurn = current_game.current_turn === window.myUserId;
                    
                    if (isFired || !isMyTurn || current_game.status !== 'battle') cell.classList.add('disabled');
                    else cell.classList.remove('disabled');
                }
            }
        }
    }


    async function handleShot(event) {
        if (placementMode || current_game.status !== 'battle' || current_game.current_turn !== window.myUserId) return;

        const cell = event.currentTarget;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        if (cell.classList.contains('disabled')) return;

        const opponentBoardKey = isPlayer1 ? 'player2_board' : 'player1_board';
        const myBoardKey = isPlayer1 ? 'player1_board' : 'player2_board';
        const opponentIdKey = isPlayer1 ? 'player2_id' : 'player1_id';
        
        let opponentBoard = JSON.parse(JSON.stringify(current_game[opponentBoardKey]));
        let myBoard = JSON.parse(JSON.stringify(current_game[myBoardKey]));

        resetLastBomb(opponentBoard);
        resetLastBomb(myBoard);
        
        const targetCell = opponentBoard[row][col];
        targetCell.lastBomb = true;
        
        let isHit = false;
        let newStatus = 'battle';
        let winnerId = null;

        if (targetCell.ship && !targetCell.hit) {
            isHit = true;
            targetCell.hit = true;
            
            if (checkWin(opponentBoard)) {
                newStatus = 'finished';
                winnerId = window.myUserId;
            }

        } else if (!targetCell.ship && !targetCell.miss) {
            targetCell.miss = true;
        } else return;
        
        const nextTurnId = isHit ? window.myUserId : current_game[opponentIdKey];
        
        const updateObject = {
            [opponentBoardKey]: opponentBoard,
            [myBoardKey]: myBoard,
            current_turn: nextTurnId,
            status: newStatus,
            winner_id: winnerId,
        };

        const { error } = await supabase
            .from('games')
            .update(updateObject)
            .eq('id', current_game.id);

        if (error) {
            alert("Ошибка при выполнении выстрела. Проверьте RLS UPDATE.");
            console.error("Ошибка выстрела (RLS UPDATE):", error);
        }
    }

    function checkWin(board) {
        for (let i = 1; i <= BOARD_SIZE; i++) {
            for (let j = 1; j <= BOARD_SIZE; j++) {
                if (board[i][j].ship && !board[i][j].hit) return false;
            }
        }
        return true;
    }

    function resetLastBomb(board) {
        for (let i = 1; i <= BOARD_SIZE; i++) {
            for (let j = 1; j <= BOARD_SIZE; j++) {
                if (board[i][j].lastBomb) board[i][j].lastBomb = false;
            }
        }
    }


    function renderShipList() {
        const list = document.getElementById('ship-list');
        if (!list) return;

        list.innerHTML = '';
        myShips = [];

        let shipIndex = 0;
        SHIP_CONFIG.forEach(config => {
            for (let i = 0; i < config.count; i++) {
                const shipId = `${config.size}-${shipIndex++}`;
                const shipWrapper = document.createElement('li');
                shipWrapper.className = 'draggable-ship-wrapper';

                const shipDiv = document.createElement('div');
                shipDiv.className = 'draggable-ship';
                shipDiv.dataset.size = config.size;
                shipDiv.dataset.id = shipId;
                shipDiv.dataset.orientation = 'horizontal';
                shipDiv.draggable = true;
                
                const rotateBtn = document.createElement('button');
                rotateBtn.textContent = '🔄';
                rotateBtn.className = 'challenge-button rotate-btn';
                rotateBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    shipDiv.dataset.orientation = shipDiv.dataset.orientation === 'horizontal' ? 'vertical' : 'horizontal';
                    shipDiv.classList.toggle('rotated');
                };

                for (let s = 0; s < config.size; s++) {
                    const part = document.createElement('div');
                    part.className = 'ship-part';
                    shipDiv.appendChild(part);
                }
                
                shipWrapper.appendChild(shipDiv);
                shipWrapper.appendChild(rotateBtn);
                list.appendChild(shipWrapper);
            }
        });

        initDragAndDrop();
        generateInitialBoardGrid();
        startBattleButton.disabled = true;
    }

    function generateInitialBoardGrid() {
        boardGrid = [];
        for (let i = 0; i <= BOARD_SIZE; i++) {
            boardGrid[i] = [];
            for (let j = 0; j <= BOARD_SIZE; j++) {
                boardGrid[i][j] = { ship: false, hit: false, miss: false, lastBomb: false };
            }
        }
    }


    function initDragAndDrop() {
        const ships = document.querySelectorAll('.draggable-ship');
        const cells = myBoardElement.querySelectorAll('.cell:not(.coord)');
        
        ships.forEach(ship => {
            ship.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', ship.dataset.id);
                ship.classList.add('is-dragging');
                myBoardElement.classList.add('drag-active');
            });

            ship.addEventListener('dragend', (e) => {
                ship.classList.remove('is-dragging');
                myBoardElement.classList.remove('drag-active');
                clearPlacementPreview();
            });
        });

        cells.forEach(cell => {
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('dragleave', handleDragLeave);
            cell.addEventListener('drop', handleDrop);
            cell.addEventListener('mouseenter', handleMouseEnter);
            cell.addEventListener('mouseleave', handleMouseLeave);
        });
    }


    function handleDrop(e) {
        e.preventDefault();
        
        const shipId = e.dataTransfer.getData('text/plain');
        const shipElement = document.querySelector(`.draggable-ship[data-id="${shipId}"]`);
        if (!shipElement) return;

        const size = parseInt(shipElement.dataset.size);
        const orientation = shipElement.dataset.orientation;
        const row = parseInt(e.currentTarget.dataset.row);
        const col = parseInt(e.currentTarget.dataset.col);

        if (checkPlacementValidity(row, col, size, orientation, true)) { 
            removeShipFromGrid(shipId);
            addShipToGrid(shipId, row, col, size, orientation);
            
            shipElement.parentElement.classList.add('ship-placed'); 
            
            updateBoardDisplay(myBoardElement, boardGrid, true);
            checkAllShipsPlaced();

        } else {
            alert("Корабль нельзя разместить в этом месте! Проверьте границы и отступы (правило 1 клетки).");
        }
        
        clearPlacementPreview();
        shipElement.classList.remove('is-dragging');
        myBoardElement.classList.remove('drag-active');
    }

    function checkPlacementValidity(startRow, startCol, size, orientation, checkBuffer = false) {
        let cellsToCheck = [];
        
        for (let k = 0; k < size; k++) {
            let r = orientation === 'horizontal' ? startRow : startRow + k;
            let c = orientation === 'horizontal' ? startCol + k : startCol;

            if (r < 1 || r > BOARD_SIZE || c < 1 || c > BOARD_SIZE) return false;
            
            if (boardGrid[r][c].ship && !myShips.some(s => s.id === document.querySelector('.draggable-ship.is-dragging')?.dataset.id)) return false; 
            
            cellsToCheck.push({ r, c });
        }
        
        if (checkBuffer) {
            for (const { r, c } of cellsToCheck) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        let adjR = r + dr;
                        let adjC = c + dc;
                        
                        if (adjR >= 1 && adjR <= BOARD_SIZE && adjC >= 1 && adjC <= BOARD_SIZE) {
                            if (dr === 0 && dc === 0) continue; 
                            
                            if (boardGrid[adjR][adjC].ship) {
                                if (!cellsToCheck.some(cell => cell.r === adjR && cell.c === adjC)) return false; 
                            }
                        }
                    }
                }
            }
        }
        
        return true;
    }


    function addShipToGrid(shipId, startRow, startCol, size, orientation) {
        myShips = myShips.filter(s => s.id !== shipId);
        myShips.push({ id: shipId, size: size, row: startRow, col: startCol, orientation: orientation });
        
        if (orientation === 'horizontal') {
            for (let j = startCol; j < startCol + size; j++) {
                if (startRow >= 1 && startRow <= BOARD_SIZE && j >= 1 && j <= BOARD_SIZE) {
                     boardGrid[startRow][j].ship = true;
                }
            }
        } else {
            for (let i = startRow; i < startRow + size; i++) {
                if (i >= 1 && i <= BOARD_SIZE && startCol >= 1 && startCol <= BOARD_SIZE) {
                    boardGrid[i][startCol].ship = true;
                }
            }
        }
    }

    function removeShipFromGrid(shipId) {
        const shipToRemove = myShips.find(s => s.id === shipId);
        if (!shipToRemove) return;

        const { row, col, size, orientation } = shipToRemove;

        if (orientation === 'horizontal') {
            for (let j = col; j < col + size; j++) {
                 if (row >= 1 && row <= BOARD_SIZE && j >= 1 && j <= BOARD_SIZE) boardGrid[row][j].ship = false;
            }
        } else {
            for (let i = row; i < row + size; i++) {
                 if (i >= 1 && i <= BOARD_SIZE && col >= 1 && col <= BOARD_SIZE) boardGrid[i][col].ship = false;
            }
        }

        myShips = myShips.filter(s => s.id !== shipId);
    }
    
    function placeShipsRandomly() {
        generateInitialBoardGrid();
        myShips = [];
        
        let shipIndex = 0;
        SHIP_CONFIG.forEach(config => {
            for (let i = 0; i < config.count; i++) {
                let placed = false;
                const shipId = `${config.size}-${shipIndex++}`;
                
                let attempts = 0;
                while (!placed && attempts < 1000) {
                    attempts++;
                    const size = config.size;
                    const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
                    const startRow = Math.floor(Math.random() * BOARD_SIZE) + 1;
                    const startCol = Math.floor(Math.random() * BOARD_SIZE) + 1;

                    if (checkPlacementValidity(startRow, startCol, size, orientation, true)) {
                        addShipToGrid(shipId, startRow, startCol, size, orientation);
                        placed = true;
                    }
                }

                if (!placed) {
                    console.error("Не удалось разместить корабль:", shipId);
                    alert("Ошибка рандомной расстановки. Перезагрузите страницу.");
                    return;
                }
            }
        });
        
        document.querySelectorAll('.draggable-ship-wrapper').forEach(el => el.classList.add('ship-placed'));
        updateBoardDisplay(myBoardElement, boardGrid, true);
        checkAllShipsPlaced();
    }


    function checkAllShipsPlaced() {
        const totalShips = SHIP_CONFIG.reduce((sum, cfg) => sum + cfg.count, 0);
        const placedShipsCount = document.querySelectorAll('.draggable-ship-wrapper.ship-placed').length;
        
        if (placedShipsCount === totalShips) {
            startBattleButton.disabled = false;
            turnIndicator.textContent = '✅ Все корабли расставлены! Нажмите "ГОТОВ!".';
        } else {
            startBattleButton.disabled = true;
            turnIndicator.textContent = `🛥️ Перетащите все корабли на поле. Осталось: ${totalShips - placedShipsCount}`;
        }
    }

    function handleDragOver(e) { e.preventDefault(); }
    function handleDragLeave(e) { clearPlacementPreview(); }

    function handleMouseEnter(e) {
        if (!myBoardElement.classList.contains('drag-active')) return;
        
        const shipId = document.querySelector('.draggable-ship.is-dragging')?.dataset.id;
        if (!shipId) return;
        
        const shipElement = document.querySelector(`.draggable-ship[data-id="${shipId}"]`);
        const size = parseInt(shipElement.dataset.size);
        const orientation = shipElement.dataset.orientation;
        const row = parseInt(e.currentTarget.dataset.row);
        const col = parseInt(e.currentTarget.dataset.col);
        
        showPlacementPreview(row, col, size, orientation);
    }

    function handleMouseLeave(e) {}

    function showPlacementPreview(startRow, startCol, size, orientation) {
        clearPlacementPreview();
        const isValid = checkPlacementValidity(startRow, startCol, size, orientation, true);
        
        const maxK = size;
        for (let k = 0; k < maxK; k++) {
            let r = orientation === 'horizontal' ? startRow : startRow + k;
            let c = orientation === 'horizontal' ? startCol + k : startCol;

            const cell = myBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cell) {
                cell.classList.add(isValid ? 'ship-overlay-valid' : 'ship-overlay-invalid');
            }
        }
    }

    function clearPlacementPreview() {
        myBoardElement.querySelectorAll('.ship-overlay-valid, .ship-overlay-invalid').forEach(cell => {
            cell.classList.remove('ship-overlay-valid', 'ship-overlay-invalid');
        });
    }


    startBattleButton.addEventListener('click', async () => {
        if (startBattleButton.disabled) return;
        
        startBattleButton.disabled = true;
        
        const boardKey = isPlayer1 ? 'player1_board' : 'player2_board';
        
        let updateObject = {
            [boardKey]: boardGrid,
            status: 'placement'
        };

        const opponentBoardKey = isPlayer1 ? 'player2_board' : 'player1_board';
        const opponentBoardData = current_game[opponentBoardKey];
        
        if (opponentBoardData !== null && current_game.status === 'placement' || current_game.status === 'lobby') {
            updateObject.status = 'battle';
            updateObject.current_turn = current_game.player1_id; 
            console.log("Оба игрока готовы. Устанавливаем статус 'battle'.");
        } else if (current_game.status === 'lobby') {
             updateObject.status = 'placement';
        }
        
        const { error } = await supabase
            .from('games')
            .update(updateObject)
            .eq('id', current_game.id);

        if (error) {
            alert("Ошибка при сохранении расстановки. Проверьте RLS UPDATE."); 
            console.error("Ошибка finishPlacement (RLS UPDATE):", error);
        } else {
            turnIndicator.textContent = 'Расстановка сохранена. Ожидаем соперника.';
        }
    });


    function handleGameFinished(game) {
        boardsContainer.style.display = 'none';
        activeGameInfo.style.display = 'none';
        gameFinishCard.style.display = 'block';

        const winnerId = game.winner_id;
        const finishMessageElement = document.getElementById('finish-message');

        if (winnerId === window.myUserId) {
            finishMessageElement.innerHTML = '👑 **ПОБЕДА!** Вы потопили все корабли противника!';
            finishMessageElement.style.color = '#00a84f';
        } else if (winnerId) {
            finishMessageElement.innerHTML = `💀 **ПОРАЖЕНИЕ.** Победил: ${isPlayer1 ? game.player2_name : game.player1_name}.`;
            finishMessageElement.style.color = '#d90000';
        } else {
            finishMessageElement.innerHTML = 'Игра завершена (Статус: ' + game.status + ')';
            finishMessageElement.style.color = '#0077b6';
        }
        
        document.getElementById('back-to-lobby-button').onclick = () => {
            current_game = null; 
            showLobby();
        };
    }

    document.getElementById('end-game-button').addEventListener('click', async () => {
        if (!current_game || !confirm("Вы уверены, что хотите сдаться? Игра будет завершена и засчитана как поражение.")) return;

        const winnerId = isPlayer1 ? current_game.player2_id : current_game.player1_id;

        const { error } = await supabase
            .from('games')
            .update({ status: 'finished', winner_id: winnerId })
            .eq('id', current_game.id);

        if (error) {
            console.error("Ошибка при сдаче игры:", error);
            alert("Не удалось завершить игру. Проверьте RLS UPDATE.");
        }
    });
    
})();
