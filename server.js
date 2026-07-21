const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const FILE_PATH = path.join(__dirname, 'tasks.json');

// Helper to read database
async function getTasksFromFile() {
    try {
        const data = await fs.readFile(FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Helper to write database
async function saveTasksToFile(tasks) {
    await fs.writeFile(FILE_PATH, JSON.stringify(tasks, null, 2), 'utf8');
}

// GET all tasks
app.get('/api/tasks', async (req, res) => {
    const tasks = await getTasksFromFile();
    res.json(tasks);
});

// POST create task with timestamp/alert time
app.post('/api/tasks', async (req, res) => {
    const { description, alertTime } = req.body;
    const tasks = await getTasksFromFile();
    
    const newTask = {
        id: Date.now(),
        description,
        alertTime: alertTime || null, // Format: "HH:MM" or null
        completed: false,
        notified: false
    };
    
    tasks.push(newTask);
    await saveTasksToFile(tasks);
    res.status(201).json(newTask);
});

// PATCH update status (Mark completed/notified)
app.patch('/api/tasks/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const tasks = await getTasksFromFile();
    const task = tasks.find(t => t.id === id);
    
    if (!task) return res.status(404).json({ error: "Task not found" });
    
    if (req.body.hasOwnProperty('completed')) task.completed = req.body.completed;
    if (req.body.hasOwnProperty('notified')) task.notified = req.body.notified;
    
    await saveTasksToFile(tasks);
    res.json(task);
});

// DELETE a task
app.delete('/api/tasks/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let tasks = await getTasksFromFile();
    const filteredTasks = tasks.filter(t => t.id !== id);
    
    await saveTasksToFile(filteredTasks);
    res.json({ success: true, message: "Task deleted successfully" });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(8080, () => console.log('🚀 Senior-level server running at http://localhost:8080'));