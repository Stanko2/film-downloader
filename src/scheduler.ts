import { schedule, ScheduledTask } from "node-cron"
import db from "./db"
import { downloaders } from "./downloadCommand"
import { Downloader } from "./downloaders"


class Scheduler {
    task!: ScheduledTask
    cron!: string
    constructor() {
        db.getDownloadCron().then(cron=> {
            this.cron = cron
            this.task = schedule(cron, this.run)
            console.log('Scheduler initialized with cron: ' + cron);
            
        })
    }
    
    async run(r: Date | 'manual' | 'init') {
        console.log(r.toString() + ' | ran automatic download')
        if(Downloader.busy) return
        const download = (await db.getAllDownloads()).sort((a,b)=> a.id - b.id).filter(d => d.state == 'scheduled')[0]
        if(!download) return
        downloaders[download.id].startDownload()
    }
    
    async updateCron(newCron: string){
        console.log(newCron)
        await db.setDownloadCron(newCron)
        this.cron = newCron
        this.task.stop()
        this.task = schedule(this.cron, this.run)
    }
}

const scheduler = new Scheduler()
export default scheduler
