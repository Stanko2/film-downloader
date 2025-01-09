import fs from 'fs'
import { Logger } from '../logger'

export interface DownloadProgress {
    total: number
    downloaded: number
    percent: number
}

export abstract class Downloader {
    resumable = false
    downloaded = 0
    static ProgressTimeout = 10000
    static busy = false

    static filesProcessing: Set<string> = new Set()
    constructor(protected url: string, protected name: string, protected headers: Record<string, string>) {

    }

    abstract startDownload(progressCallback: (progress: DownloadProgress) => void): Promise<void>

    abstract init(): Promise<boolean>

    async check() {
        await this.init()
    }

    async start(progressCallback: (progress: DownloadProgress) => void): Promise<void> {
        Downloader.busy = true
        if(!this.resumable) {
            this.downloaded = 0
        }
        if (fs.existsSync(this.name)) {
            this.downloaded = fs.statSync(this.name).size
        }

        let needRestart = false
        let restartTimeout: NodeJS.Timeout | undefined
        const callback = function(progress: DownloadProgress) {
            clearTimeout(restartTimeout)
            progressCallback(progress)
            if(progress.percent == 100) {
                needRestart = false
                return
            }
            restartTimeout = setTimeout(() => {
                needRestart = true
            }, Downloader.ProgressTimeout);
        }
        let interval: NodeJS.Timeout | undefined
        let success = false
        Downloader.filesProcessing.clear()
        while(!success) {
            try {
                await Promise.race([
                    this.startDownload(callback),
                    new Promise<void>((resolve, reject) => {
                        if(!this.resumable) return
                        interval = setInterval(() => {
                            if(needRestart) {
                                Logger.warn(this.name + ' Restarting Download');
                                clearInterval(interval)
                                reject(new Error('Download stuck'))
                            }
                        }, 100);
                        setTimeout(() => {
                            resolve()
                        }, 3600 * 1000)
                    })
                ])
            }
            catch(err) {
                if((err as Error).message === 'Download stuck') {
                    clearInterval(interval)
                    clearTimeout(restartTimeout)
                    this.cancel()
                    needRestart = false
                    continue
                }
                Downloader.busy = false
                throw err
            }

            success = true
        }

        clearInterval(interval)
        Downloader.busy = false
    }

    abstract cancel(): void;
}
