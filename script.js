// In-memory list of tasks loaded from the API.
let localTasksCache = [];

// Alarm-related variables for the browser notification system.
let audioCtx = null;
let alarmOscillator = null;
let alarmIntervalId = null;
let alarmTimeoutId = null;
let vibrationIntervalId = null;

// Request browser notification permission when available.
if (Notification.permission === "default") {
    Notification.requestPermission();
}

// Display short feedback messages for save, update, and delete actions.
function setStatus(message, isError = false) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return;

    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#ef4444' : '#0f766e';
    statusEl.style.display = message ? 'block' : 'none';
}

// Controllable Persistent Stream Generation 
// Trigger the alarm UI and device feedback when a task deadline is reached.
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

// Stop the alarm sound, vibration, and popup cleanly.
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

// Load all tasks from the backend and re-render the list.
async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        if (!res.ok) throw new Error('Unable to load tasks');

        const tasks = await res.json();
        localTasksCache = Array.isArray(tasks) ? tasks : [];
        renderTasks();
        setStatus('');
    } catch (error) {
        console.error(error);
        setStatus('Unable to load saved tasks right now.', true);
    }
}

// Render each task into the list with its action buttons.
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

// Save a new task through the API and refresh the UI.
async function addTask(event) {
    if (event) event.preventDefault();

    const taskInput = document.getElementById('taskInput');
    const timeInput = document.getElementById('timeInput');
    const description = taskInput.value.trim();

    if (!description) {
        setStatus('Please enter a task description before saving.', true);
        return;
    }

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description,
                alertTime: timeInput.value || null
            })
        });

        if (!res.ok) throw new Error('Unable to save task');

        const createdTask = await res.json();
        localTasksCache = [...localTasksCache, createdTask];
        renderTasks();
        setStatus('Task saved successfully.');

        taskInput.value = '';
        timeInput.value = '';
    } catch (error) {
        console.error(error);
        setStatus('Unable to save task right now.', true);
    }
}

// Mark a task as completed in the backend and update the UI.
async function toggleComplete(id) {
    try {
        const res = await fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true })
        });

        if (!res.ok) throw new Error('Unable to update task');

        localTasksCache = localTasksCache.map((task) => task.id === id ? { ...task, completed: true } : task);
        renderTasks();
        setStatus('Task completed.');
    } catch (error) {
        console.error(error);
        setStatus('Unable to update task.', true);
    }
}

// Delete a task from the backend and update the visible list.
async function deleteTask(id) {
    try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Unable to delete task');

        localTasksCache = localTasksCache.filter((task) => task.id !== id);
        renderTasks();
        setStatus('Task removed.');
    } catch (error) {
        console.error(error);
        setStatus('Unable to remove task.', true);
    }
}

// Periodically check whether any task has reached its scheduled time.
setInterval(() => {
    const now = new Date().getTime();

    for (const task of [...localTasksCache]) {
        if (task.alertTime && !task.completed && !task.notified) {
            const taskTime = new Date(task.alertTime).getTime();

            if (now >= taskTime) {
                task.notified = true;

                startAlarmHardwareEngine(task.description);

                if (Notification.permission === 'granted') {
                    new Notification('🚨 Task Deadline Met!', {
                        body: `Time is up for: ${task.description}`,
                    });
                }

                fetch(`/api/tasks/${task.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notified: true })
                }).catch(console.error);
            }
        }
    }
}, 1000);

fetchTasks();