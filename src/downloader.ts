import axios from "axios";
import fs from 'fs'
import db from "./db";
import { extname, join } from "path"
import { downloadHls } from "./hls-download";
import fetch from 'node-fetch'

type DownloadType = 'hls' | 'file'

export interface DownloadCommand {
    url: string
    dest: string
    name: string
    state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress';
    id: number
    type: 'hls' | 'file'
    error?: string
    progress?: number
}

export async function Init() {
    console.log('Initializing Downloads');
    
    for (const key of Object.keys(downloaders)) {
        delete downloaders[parseInt(key)];
    }
    const downloads = await db.getAllDownloads()
    console.log(downloads.length);
    
    for (const download of downloads) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        new Downloader(download.url, download.dest, download.name, ()=>{}, {}, download.type, download.id)
    }
}

export const downloaders: Record<number, Downloader> = {}

export default class Downloader {
    constructor(private videoURL: string, private dest: string, private name: string, private cb: (success: boolean) => void, captionURLs: Record<string, string>, private type: DownloadType, private id: number = -1) {
        if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true, mode: 0o777})
        if(this.id == -1) {
            db.addDownloadCommand(this.toDownloadCommand('scheduled')).then(id => {
                this.id = id
                this.init()
            });
        }
        else this.init()
        this.downloadCaptions(captionURLs)

    }

    init() {
        if(this.type == 'hls'){
            this.initHls()
        }
        downloaders[this.id] = this
    }

    async startDownload(): Promise<boolean> {
        const state = (await db.getDownloadById(this.id)).state
        if(state === 'scheduled'){
            db.updateDownloadById(this.id, this.toDownloadCommand('inProgress'))
            console.log(`Starting Download ${this.name}`);
            if(this.type == 'file'){
                return await this.initFile()
            } else {
                return downloadHls(this.videoURL, this.dest, this.name, (progress) => {
                    const data = this.toDownloadCommand('inProgress')
                    data.progress = progress
                    db.updateDownloadById(this.id, data)
                }).then(() => {
                    db.updateDownloadById(this.id, this.toDownloadCommand('complete'))
                    console.log(`Finished Download ${this.name}`)
                    return true
                }).catch(() => false)
            }
        }
        return false
    }

    async initFile() {
        const res =  await axios({
            baseURL: this.videoURL,
            method: 'get',
            responseType: 'stream',
            onDownloadProgress: (progress) => {
                if(progress.total == progress.loaded){
                    db.updateDownloadById(this.id, this.toDownloadCommand('complete'))
                }
                else {
                    const data = this.toDownloadCommand('inProgress')
                    data.progress = progress.loaded / (progress.total || 1)
                    db.updateDownloadById(this.id, data)
                }
            }
        }).catch((err) => {
            console.log(err);
            db.updateDownloadById(this.id, this.toDownloadCommand('error'))
        })

        if(!res) return false
        
        const stream = fs.createWriteStream(join(this.dest, this.name + extname(this.videoURL)), {mode: 0o777})
        res.data.pipe(stream)
        return new Promise<boolean>((resolve, reject) => {
            stream.on('finish', () => {
                console.log(`Finished Download ${this.name}`)
                resolve(true)
            })
            stream.on('error', () => {
                console.log(`Error Downloading ${this.name}`)
                reject(false)
            })
        })
    }

    async initHls() {
        await fetch(this.videoURL).catch(() => this.cb(false)).then(()=> this.cb(true))
    }

    async downloadCaptions(captionURLs: Record<string, string>) {
        for (const caption of Object.keys(captionURLs)) {
            const res = await fetch(captionURLs[caption])
            fs.writeFileSync(join(this.dest, this.name + '-' + caption + extname(captionURLs[caption])), await res.text(), {mode: 0o777})
        }
    }

    cancel(): void {
        db.updateDownloadById(this.id, this.toDownloadCommand('error'))
    }

    toDownloadCommand(state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress'): DownloadCommand {
        return {
            url: this.videoURL,
            name: this.name,
            dest: this.dest,
            id: this.id,
            type: this.type,
            state
        }
    }

}

