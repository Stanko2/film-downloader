import {createClient, RedisClientType} from 'redis'
import fs from 'fs'
import { DownloadCommand } from './downloader'
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

    async addDownloadCommand(command: DownloadCommand): Promise<number> {
        if(command.id == -1){
            if (await this.client.exists("downloadId") == 0) {
                await this.client.set("downloadId", await this.client.lLen("Downloads"))
            }
            command.id = await this.client.incr("downloadId")
        }
        await this.client.rPush("Downloads", JSON.stringify(command))
        return command.id
    }

    async getFirstDownloadCommand(): Promise<DownloadCommand | null> {
        const res = await this.client.lPop("Downloads")
        return JSON.parse(res || 'null') as DownloadCommand
    }

    async getAllDownloads(): Promise<DownloadCommand[]> {
        return (await this.client.lRange("Downloads", 0, -1)).map(x => JSON.parse(x))
    }

    async updateDownloadById(id: number, data: DownloadCommand) {
        this.client.lSet("Downloads", id, JSON.stringify(data))
    }

    async getDownloadById(id: number): Promise<DownloadCommand> {
        const res = await this.client.lIndex("Downloads", id)
        return JSON.parse(res || 'null') as DownloadCommand
    }

    async getDownloadCron(): Promise<string> {
        return await this.client.get('downloadCron') || '0 0 0 * * *';
    }

    async removeDownloadById(id: number): Promise<void> {
        this.client.lRem("Downloads", 1, JSON.stringify(await this.getDownloadById(id)))
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