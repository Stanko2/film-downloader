import { DownloaderHelper } from "node-downloader-helper";
import fs from 'fs'
import db from "./db";

export interface DownloadCommand {
    url: string
    dest: string
    name: string
    state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress';
    id: number
}

export async function Init() {
    downloaders.splice(0, downloaders.length)
    const downloads = await db.getAllDownloads()
    for (const download of downloads) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        new Downloader(download.url, download.dest, download.name, ()=>{}, download.id)
    }
}

export const downloaders: Downloader[] = []

export default class Downloader {
    downloader!: DownloaderHelper
    constructor(private url: string, private dest: string, private name: string, cb: (success: boolean) => void, private id: number = -1) {
        if(!fs.existsSync(dest)) fs.mkdirSync(dest)
        this.downloader = new DownloaderHelper(url, dest, {
            fileName: name + url.substring(url.length - 4)
        })
        this.downloader.getTotalSize().then((res)=>{
            cb(res.total != null)
            if(res.total){
                downloaders.push(this)
                if(id == -1){
                    db.addDownloadCommand(this.toDownloadCommand('scheduled')).then(id => this.id = id)
                }
            }
        })
        this.downloader.on('error', (s)=>{
            console.error(s);
            db.updateDownloadById(this.id, this.toDownloadCommand('error'))
        })
        this.downloader.on('progress', (s) => {
            if(s.progress == 100){
                db.updateDownloadById(this.id, this.toDownloadCommand('complete'))
            }
        })
    }

    async startDownload(): Promise<boolean> {
        const state = (await db.getDownloadById(this.id)).state
        if(state === 'scheduled'){
            db.updateDownloadById(this.id, this.toDownloadCommand('inProgress'))
            console.log(`Starting Download ${this.name}`);
            return await this.downloader.start()
        }
        return false
    }

    toDownloadCommand(state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress') {
        return {
            url: this.url,
            name: this.name,
            dest: this.dest,
            id: this.id,
            state
        }
    }
}

