import { Fetcher, RunOutput, makeProviders, makeStandardFetcher, targets } from "@movie-web/providers";
import MovieDB from "node-themoviedb";

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
            const s = await scrapeEpisode(showData, season.season_number, i+1, source);
            console.log(`scraped episode #${i + 1} of season ${season.season_number}`);
            if(s)
                yield {
                src: s,
                season: season.season_number,
                episode: i+1
            };
        }
    }
}
  
export async function scrapeEpisode(data: MovieDB.Responses.TV.GetDetails, season: number, episode: number, source: string | undefined): Promise<RunOutput | null> {
    const providers = makeProviders({
        fetcher: getFetcher(),
        target: targets.ANY
    })

    return providers.runAll({
        media: {
        type: 'show',
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
        },
        sourceOrder: source ? [source] : undefined
    }).catch(() => null)
}

export async function ScrapeMovie(movieData: MovieDB.Responses.Movie.GetDetails, source: string | undefined) {
    const providers = makeProviders({
      fetcher: getFetcher(),
      target: targets.ANY
    })
    
    return await providers.runAll({
        media: {
          type: 'movie',
          title: movieData.title,
          tmdbId: movieData.id.toString() || '',
          imdbId: movieData.imdb_id ?? undefined,
          releaseYear: new Date(movieData.release_date).getFullYear()
        }, 
        sourceOrder: source ? [source] : undefined
      })
  }
  