import express from "express";
import db from "./db";

interface LogMessage {
    message: string;
    level: 'info' | 'warn' | 'error';
    timestamp: number;
}

export class Logger {
    public static log(message: any) {
        const msg: LogMessage = {
            message: message.toString(),
            level: 'info',
            timestamp: Date.now()
        }
        db.client.rPush('logs', JSON.stringify(msg));
    }

    public static warn(message: any) {
        const msg: LogMessage = {
            message: message.toString(),
            level: 'warn',
            timestamp: Date.now()
        }
        db.client.rPush('logs', JSON.stringify(msg));
    }

    public static error(message: Error) {
        const msg: LogMessage = {
            message: message.toString(),
            level: 'error',
            timestamp: Date.now()
        }
        db.client.rPush('logs', JSON.stringify(msg));
    }

    public static async getLogs() {
        return (await db.client.lRange('logs', 0, -1)).map(e=>JSON.parse(e));
    }

    public static async clearLogs() {
        return await db.client.del('logs');
    }
}

const router = express.Router();

router.get('/', async (req, res) => {
    const logs = await Logger.getLogs();
    res.render('logs', { logs, 
        levelMap: { info: 'primary', warn: 'warning', error: 'danger' },
    });
});

router.post('/clear', async (req, res) => {
    await Logger.clearLogs();
    res.redirect('/logs');
});

export default router;