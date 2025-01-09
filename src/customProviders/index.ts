import { ProviderBuilder, Stream, } from '../providerLib';
import tmdbScrape from './vidsrc/vidsrc'

export function addCustomProviders(builder: ProviderBuilder): ProviderBuilder {
  return builder.addSource({
    scrapeMovie: async function(ctx) {
      const data = await tmdbScrape(ctx.media.tmdbId, "movie");

      return {
        stream: data.map(e=> {
          return <Stream>{
            id: e.name,
            flags: [],
            type: "hls",
            captions: [],
            playlist: e.stream,
            headers: {
              referrer: e.referer
            }
          }
        }),
        sourceId: 'vidsrc',
        embeds: []
      }
    },
    scrapeShow: async function(ctx) {
      const data = await tmdbScrape(ctx.media.tmdbId, "tv", ctx.media.season.number, ctx.media.episode.number);
      console.log(data);
      return {
        stream: data.map(e=> {
          return <Stream>{
            id: e.name,
            flags: [],
            type: "hls",
            captions: [],
            playlist: e.stream,
            headers: {
              referrer: e.referer
            }
          }
        }),
        sourceId: 'vidsrc',
        embeds: []
      }
    },
    disabled: false,
    id: "vidsrc",
    mediaTypes: ['movie', 'show'],
    rank: 1000,
    name: "VidSrc",
    type: 'source',
    externalSource: true,
    flags: []
  });
}
