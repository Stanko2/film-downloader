import fs from 'fs'

export interface DownloadProgress {
    total: number
    downloaded: number
    percent: number
}

export abstract class Downloader {
    resumable = false
    downloaded = 0
    static ProgressTimeout = 4000
    constructor(protected url: string, protected name: string) {
     
    }

    abstract startDownload(progressCallback: (progress: DownloadProgress) => void): Promise<boolean>

    abstract init(): Promise<boolean>

    async check() {
        await this.init()
    }

    async start(progressCallback: (progress: DownloadProgress) => void): Promise<boolean> {
        if(!this.resumable) {
            this.downloaded = 0
        }
        if (fs.existsSync(this.name)) {
            this.downloaded = fs.statSync(this.name).size
        }

        let needRestart = false
        let restartTimeout: NodeJS.Timeout | undefined
        const callback = function(progress: DownloadProgress) {
            console.log(progress.downloaded, progress.total, progress.percent);
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
        let interval: NodeJS.Timer | undefined
        await Promise.all([
            this.startDownload(callback),
            new Promise<void>((resolve, reject) => {
                interval = setInterval(() => {
                    if(needRestart) {
                        console.log('Restarting Download');
                        clearInterval(interval)
                        reject()
                    }
                }, 100);
                setTimeout(() => {
                    resolve()
                }, 3600 * 1000)
            })
        ]).catch(() => {
            this.cancel()
            console.log('Retrying download');
            this.start(progressCallback)
        })
        clearInterval(interval)

        return true
    }

    abstract cancel(): void;
}