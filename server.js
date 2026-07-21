// Import required modules for the web server and file system access.
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

// Use a default port of 8080, but allow environment-based overrides.
const PORT = process.env.PORT || 8080;

// Enable JSON request parsing and serve static frontend files.
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Path to the JSON file used as the task database.
const FILE_PATH = path.join(__dirname, 'tasks.json');

// Ensure the task storage file exists and returns a valid array of tasks.
async function ensureTaskStore() {
    try {
        const data = await fs.readFile(FILE_PATH, 'utf8');
        if (!data.trim()) {
            await fs.writeFile(FILE_PATH, '[]', 'utf8');
            return [];
        }

        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
            await fs.writeFile(FILE_PATH, '[]', 'utf8');
            return [];
        }

        throw error;
    }
}

// Save the task list back to the JSON file in a readable format.
async function saveTasksToFile(tasks) {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    await fs.writeFile(FILE_PATH, JSON.stringify(safeTasks, null, 2), 'utf8');
    return safeTasks;
}

// Return all saved tasks to the frontend.
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await ensureTaskStore();
        res.json(tasks);
    } catch (error) {
        console.error('Failed to load tasks:', error);
        res.status(500).json({ error: 'Unable to load tasks right now.' });
    }
});

// Create a new task and persist it to the JSON file.
app.post('/api/tasks', async (req, res) => {
    try {
        const { description, alertTime } = req.body;
        const cleanedDescription = String(description || '').trim();

        if (!cleanedDescription) {
            return res.status(400).json({ error: 'Task description is required.' });
        }

        const tasks = await ensureTaskStore();
        const newTask = {
            id: Date.now(),
            description: cleanedDescription,
            alertTime: alertTime || null,
            completed: false,
            notified: false,
            createdAt: new Date().toISOString()
        };

        tasks.push(newTask);
        await saveTasksToFile(tasks);
        res.status(201).json(newTask);
    } catch (error) {
        console.error('Failed to create task:', error);
        res.status(500).json({ error: 'Unable to save task right now.' });
    }
});

// Update an existing task such as completion or notification state.
app.patch('/api/tasks/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const tasks = await ensureTaskStore();
        const task = tasks.find((item) => item.id === id);

        if (!task) return res.status(404).json({ error: 'Task not found' });

        if (Object.prototype.hasOwnProperty.call(req.body, 'completed')) {
            task.completed = req.body.completed;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'notified')) {
            task.notified = req.body.notified;
        }

        task.updatedAt = new Date().toISOString();
        await saveTasksToFile(tasks);
        res.json(task);
    } catch (error) {
        console.error('Failed to update task:', error);
        res.status(500).json({ error: 'Unable to update task right now.' });
    }
});

// Remove a task from storage.
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const tasks = await ensureTaskStore();
        const filteredTasks = tasks.filter((item) => item.id !== id);

        await saveTasksToFile(filteredTasks);
        res.json({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Failed to delete task:', error);
        res.status(500).json({ error: 'Unable to delete task right now.' });
    }
});

// Serve the main application page.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server and log the local URL.
app.listen(PORT, () => console.log(`🚀 Professional task server running at http://localhost:${PORT}`));