import {createClient, RedisClientType} from 'redis'
import fs from 'fs'
import { IDownloadCommand } from './downloadCommand'
import { validate } from 'node-cron'

class Database {
    async getSaveLocation(type: 'films' | 'series'): Promise<string> {
        return await this.client.get(type + 'saveLocation') || '/home/stanko/Documents'
    }
    async setSaveLocation(type: 'films' | 'series', path: string) : Promise<void> {
        console.log(fs.readdirSync(path))
        if(!fs.existsSync(path)) {
            throw new Error('Non-existent path')
        }
        await this.client.set(type + 'saveLocation', path)
    }

    client: RedisClientType;
    constructor () {
        this.client = createClient({url: process.env.REDIS_URL })
        this.client.connect()
    }

    async addDownloadCommand(command: IDownloadCommand): Promise<number> {
        if(command.id == -1){
            if (await this.client.exists("downloadId") == 0) {
                await this.client.set("downloadId", 0);
            }
            command.id = await this.client.incr("downloadId")
        }
        await this.client.set("Downloads:" + command.id, JSON.stringify(command))
        return command.id
    }


    async getAllDownloads(): Promise<IDownloadCommand[]> {
        const keys = await this.client.keys("Downloads:*");
        if(keys.length == 0) return [];
        
        const res = await this.client.mGet(keys);
        return res.map(x => JSON.parse(x || 'null') as IDownloadCommand)
    }

    async updateDownloadById(id: number, data: IDownloadCommand) {
        this.client.set("Downloads:" + id, JSON.stringify(data))
    }

    async getDownloadById(id: number): Promise<IDownloadCommand> {
        const res = await this.client.get('Downloads:' + id);
        
        return JSON.parse(res || 'null') as IDownloadCommand
    }

    async getDownloadCron(): Promise<string> {
        return await this.client.get('downloadCron') || '0 0 * * *';
    }

    async removeDownloadById(id: number): Promise<void> {
        this.client.del('Downloads:' + id);
    }

    async setDownloadCron(val: string): Promise<void> {
        if(!validate(val)){ 
            throw new Error(`"${val}" is not a valid CRON string`)
        }
        await this.client.set('downloadCron', val);
    }
}

const db = new Database()
export default db