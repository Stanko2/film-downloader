import { schedule, ScheduledTask } from "node-cron"
import db from "./db"
import { downloaders } from "./downloader"


class Scheduler {
    task!: ScheduledTask
    cron!: string
    constructor() {
        db.getDownloadCron().then(cron=> {
            this.cron = cron
            this.task = schedule(cron, this.run)
        })
    }
    
    async run(r: Date | 'manual' | 'init') {
        console.log(r.toString() + '| ran automatic download')
        let i = 0;
        let download = await db.getDownloadById(i)
        while(download && download.state != 'scheduled') {
            i++
            download = await db.getDownloadById(i)
        }
        console.log(downloaders[download.id])
        if(download.state == 'scheduled'){
            downloaders[download.id].startDownload()
        }
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
