// Copyright © 2026 Trier OS. All Rights Reserved.

const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());

app.get('/api/enrich/:partNumber', (req, res) => {
    const { partNumber } = req.params;
    const { manufacturer } = req.query;

    const pythonPath = 'python';
    const scriptPath = path.join(__dirname, 'engine.py');
    const cmd = `${pythonPath} "${scriptPath}" enrich "${partNumber}" "${manufacturer || ''}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            return res.status(500).json({ error: 'Engine failure', details: stderr });
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.status(500).json({ error: 'Parse failure', output: stdout });
        }
    });
});

const PORT = 3005;
app.listen(PORT, () => console.log(`Enrichment Engine API running on port ${PORT}`));
