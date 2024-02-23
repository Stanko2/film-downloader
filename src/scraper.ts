import { Fetcher, ScrapeMedia, makeProviders, makeStandardFetcher, targets, Stream, RunOutput } from "@movie-web/providers";
import MovieDB from "node-themoviedb";
import { getImdbId } from "./tmdb";
import { Logger } from "./logger";

function getFetcher(): Fetcher {
    return makeStandardFetcher(fetch);
}
  


export function listSources() {
    const providers = makeProviders({
      fetcher: getFetcher(),
      target: "any"
    });
    return providers.listSources();
}

export async function* getDownloadLinks(showData: MovieDB.Responses.TV.GetDetails, source: string, downloadEpisode: (season: number, episode: number) => boolean) {
    for (const season of showData.seasons) {
        for (let i = 0; i < season.episode_count; i++) {
            if(!downloadEpisode(season.season_number, i+1)) continue
            const s = await scrapeEpisode(showData, season.season_number, i+1, source).catch(err=> {
                Logger.error(new Error(`${showData.name}: error while scraping episode #${i + 1} of season ${season.season_number}: ${err}`));
                return null;
            });
            if(s){
                Logger.log(`${showData.name}: scraped episode #${i + 1} of season ${season.season_number}: ${s}`);
                yield {
                    src: s,
                    season: season.season_number,
                    episode: i+1
                };
            }
        }
    }
}

async function scrapeSource(data: ScrapeMedia, source: string) {
    const providers = makeProviders({
        fetcher: makeStandardFetcher(fetch),
        target: targets.ANY
    })
    
    const embeds =  await providers.runSourceScraper({
        media: data,
        id: source,
    }).catch(err=> {
        throw new Error('error while scraping source ' + source + ':' + err);
    })

    if(!embeds) return null;

    for (const embed of embeds.embeds) {
        const out = await providers.runEmbedScraper({
            id: embed.embedId,
            url: embed.url,
        }).catch(err=> {
            throw new Error('error while scraping embed ' + embed.embedId + ':' + err);
        });
        if (out) {
            return <RunOutput>{
                sourceId: source,
                stream: out.stream[0],
                embedId: embed.embedId
            };
        }
    }
    return null;
}
  
export async function scrapeEpisode(data: MovieDB.Responses.TV.GetDetails, season: number, episode: number, source: string | undefined): Promise<RunOutput | null> {
    const providers = makeProviders({
        fetcher: makeStandardFetcher(fetch),
        target: targets.ANY
    })
    const imdb_id = await getImdbId(data.id.toString(), 'tv') ?? undefined;
    const scrapedData: ScrapeMedia = {
        type: "show",
        episode: {
            number: episode,
            tmdbId: data.id.toString()
        },
        season: {
            number: season,
            tmdbId: data.id.toString()
        },
        releaseYear: new Date(data.first_air_date).getFullYear(),
        title: data.name,
        tmdbId: data.id.toString(),
        imdbId: imdb_id, 
    }

    if (source) {
        return await scrapeSource(scrapedData, source).catch(err=> {
            Logger.error(new Error('error while scraping ' + data.name +' from source ' + source + ':' + err));
            return null;
        });
    }

    return await providers.runAll({
        media: scrapedData,
    }).catch(err=> {
        Logger.error(new Error('error while scraping ' + data.name + ':' + err));
        return null;
    });
}

export async function ScrapeMovie(movieData: MovieDB.Responses.Movie.GetDetails, source: string | undefined) {
    const providers = makeProviders({
      fetcher: getFetcher(),
      target: targets.ANY
    })
    
    const scrapeData: ScrapeMedia = {   
        type: 'movie',
        title: movieData.title,
        tmdbId: movieData.id.toString() || '',
        imdbId: movieData.imdb_id ?? undefined,
        releaseYear: new Date(movieData.release_date).getFullYear()
    }

    if(source) {
        return await scrapeSource(scrapeData, source);
    }

    return await providers.runAll({
        media: scrapeData,
    })
}
  