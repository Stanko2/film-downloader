import { Qualities } from "@movie-web/providers";
import { ffprobe } from "fluent-ffmpeg";

const videoExtensions = ['m4v', 'avi','mpg','mp4', 'webm', 'mov', 'mkv']

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
export function humanFileSize(bytes: number, si=false, dp=1) {
    const thresh = si ? 1000 : 1024;
  
    if (Math.abs(bytes) < thresh) {
      return bytes + ' B';
    }
  
    const units = si 
      ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
      : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10**dp;
  
    do {
      bytes /= thresh;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
  
  
    return bytes.toFixed(dp) + ' ' + units[u];
  }
  
export function parseHlsQuality(file: string): Partial<Record<Qualities, string>> {
  const lines = file.split('\n')
  const out: Partial<Record<Qualities, string>> = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if(line.startsWith('#EXT-X-STREAM-INF')){
      if(line.match('1080'))
        out['1080'] = lines[i+1]
      else if(line.match('720'))
        out['720'] = lines[i+1]
      else if(line.match('480'))
        out['480'] = lines[i+1]
      else if(line.match('2160'))
        out['4k'] = lines[i+1]
      else if(line.match('360'))
        out['360'] = lines[i+1]
    }
  }

  return out
}

export function compareQualities(a: Qualities, b: Qualities): number {
  const qualities: Qualities[] = ['4k', '1080', '720', '480', '360']
  return qualities.indexOf(a) - qualities.indexOf(b)
}


export function IsVideo(name: string): boolean {
  return videoExtensions.some(ext => name.endsWith(ext))
}


export async function getStreamMetadata(file: string, name: string) {
  return new Promise((resolve, reject) => {
    ffprobe(file, (err, data)=> {
      if(err){
        reject(err);
      }
      else {
        resolve({
          name,
          resolution: {
            width: data.streams.find(s => s.codec_type === 'video')?.coded_width,
            height: data.streams.find(s => s.codec_type === 'video')?.coded_height
          },
          metadata: {
            size: humanFileSize(data.format.size || 0, true, 2),
            bit_rate: humanFileSize(data.format.bit_rate || 0),
            duration: new Date((data.format.duration || 0) * 1000).toTimeString().substring(0, 8)
          }
        })
      }
    })

  })
}
