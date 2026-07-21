let localTasksCache = [];
let audioCtx = null;
let alarmOscillator = null;
let alarmIntervalId = null;
let alarmTimeoutId = null;
let vibrationIntervalId = null;

if (Notification.permission === "default") {
    Notification.requestPermission();
}

// Controllable Persistent Stream Generation 
function startAlarmHardwareEngine(taskDescription) {
    // Show UI overlay
    const modal = document.getElementById('alarmModal');
    document.getElementById('alarmTaskText').innerText = taskDescription;
    modal.classList.add('active');

    // Initialize Audio hardware layer cleanly
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    alarmOscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    alarmOscillator.type = 'sine';
    alarmOscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Pitch in Hz
    gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime); // Control volume

    alarmOscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    alarmOscillator.start();

    // Sound Modulator: Toggles between high/low tones every 400ms to mimic an authentic alarm
    let toggle = false;
    alarmIntervalId = setInterval(() => {
        if (alarmOscillator) {
            alarmOscillator.frequency.setValueAtTime(toggle ? 880 : 1100, audioCtx.currentTime);
            toggle = !toggle;
        }
    }, 400);

    // Vibration Engine Interface: Triggers 500ms vibration pulses alternating with 500ms rests
    if (navigator.vibrate) {
        navigator.vibrate([500, 500]); // Single immediate blast
        vibrationIntervalId = setInterval(() => {
            navigator.vibrate([500, 500]);
        }, 1000);
    }

    // Safety Loop Auto-Stop Threshold: Kill process thread at exactly 60 seconds (1 minute)
    alarmTimeoutId = setTimeout(() => {
        stopAlarmHardwareEngine();
    }, 60000); 
}

// Global cleanup mechanism to kill noise, intervals, and active vibrations cleanly
function stopAlarmHardwareEngine() {
    // 1. Hide modal safely
    document.getElementById('alarmModal').classList.remove('active');

    // 2. Tear down running audio oscillators
    if (alarmOscillator) {
        try { alarmOscillator.stop(); } catch(e){}
        alarmOscillator.disconnect();
        alarmOscillator = null;
    }
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }

    // 3. Clear running software intervals
    clearInterval(alarmIntervalId);
    clearInterval(vibrationIntervalId);
    clearTimeout(alarmTimeoutId);

    // 4. Halt hardware vibration channels
    if (navigator.vibrate) {
        navigator.vibrate(0); 
    }
}

async function fetchTasks() {
    const res = await fetch('/api/tasks');
    localTasksCache = await res.json();
    renderTasks();
}

function renderTasks() {
    const list = document.getElementById('taskList');
    list.innerHTML = '';

    localTasksCache.forEach(task => {
        const li = document.createElement('li');
        if (task.completed) li.classList.add('completed');

        const formattedTime = task.alertTime ? new Date(task.alertTime).toLocaleString() : 'No alarm scheduled';

        li.innerHTML = `
            <div class="task-meta">
                <span class="text">${task.description}</span>
                <span class="time-badge">⏰ ${formattedTime}</span>
            </div>
            <div class="actions">
                ${!task.completed ? `<button class="action-btn btn-done" onclick="toggleComplete(${task.id})">✓</button>` : ''}
                <button class="action-btn btn-del" onclick="deleteTask(${task.id})">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

async function addTask() {
    const taskInput = document.getElementById('taskInput');
    const timeInput = document.getElementById('timeInput');
    
    if (!taskInput.value.trim()) return alert('Task text is empty!');

    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            description: taskInput.value.trim(),
            alertTime: timeInput.value
        })
    });

    taskInput.value = '';
    timeInput.value = '';
    fetchTasks();
}

async function toggleComplete(id) {
    await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
    });
    fetchTasks();
}

async function deleteTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
}

// Clock Threading Daemon checking deadlines every 1000ms
setInterval(() => {
    const now = new Date().getTime();

    localTasksCache.forEach(async (task) => {
        if (task.alertTime && !task.completed && !task.notified) {
            const taskTime = new Date(task.alertTime).getTime();
            
            if (now >= taskTime) {
                task.notified = true; 
                
                // Boot up running alarm/vibration instance
                startAlarmHardwareEngine(task.description);

                // OS Level push messaging fallback
                if (Notification.permission === "granted") {
                    new Notification("🚨 Task Deadline Met!", {
                        body: `Time is up for: ${task.description}`,
                    });
                }

                await fetch(`/api/tasks/${task.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notified: true })
                });
            }
        }
    });
}, 1000);

fetchTasks();