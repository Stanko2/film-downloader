import { Fetcher, ScrapeMedia, buildProviders, makeStandardFetcher, targets, RunOutput } from "./providerLib";
import MovieDB from "node-themoviedb";
import { getImdbId, getMovieFromID, getTvShowFromID } from "./tmdb";
import { Logger } from "./logger";
import { Router } from "express";
import { addCustomProviders } from "./customProviders";

function getFetcher(): Fetcher {
    return makeStandardFetcher(fetch);
}


function getProviders() {
  return addCustomProviders(buildProviders()
    .addBuiltinProviders()
    .setTarget(targets.ANY)
    .setFetcher(getFetcher()))
  .build();
}


export function listSources() {
    const providers = getProviders();
    return providers.listSources();
}

export async function* getDownloadLinks(showData: MovieDB.Responses.TV.GetDetails, source: string, downloadEpisode: (season: number, episode: number) => boolean) {
    for (const season of showData.seasons) {
        for (let i = 0; i < season.episode_count; i++) {
            if(!downloadEpisode(season.season_number, i+1)) continue
            console.log(`scraping episode #${i} of season #${season.season_number}`)
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
    const providers = getProviders()

    const embeds =  await providers.runSourceScraper({
        media: data,
        id: source,
    }).catch(err=> {
        throw new Error('error while scraping source ' + source + ':' + err);
    })

    console.log(embeds.stream)
    console.log(embeds.embeds)
    if(!embeds) return null;

    for (const stream of embeds.stream ?? []) {
        return <RunOutput>{
            sourceId: source,
            stream: stream,
            embedId: undefined
        };
    }

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
    const providers = getProviders()
    const imdb_id = await getImdbId(data.id.toString(), 'tv') ?? undefined;
    console.log("season: " + season + " episode: " + episode)
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
    const providers = getProviders()

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

export const router = Router();

router.get('/sources', (_req, res) => {
    res.send(listSources());
});

router.get('/movie', async (req, res) => {
    const tmdbId = req.query['tmdb_id'] as string;
    if(tmdbId == undefined){
        res.statusCode = 400;
        res.send({error: "No TMDB ID specified"});
        return;
    }
    const data = await getMovieFromID(tmdbId);
    const out = await ScrapeMovie(data, req.query["source"] as string).catch(()=>undefined);
    if(out) {
        res.statusCode = 200;
        res.send(out);
        return;
    }
    res.statusCode = 404;
    res.send({error: "Not found"});
})

router.get('/show', async (req,res) => {
    const tmdbId = req.query['tmdb_id'] as string;
    if(tmdbId == undefined){
        res.statusCode = 400;
        res.send({error: "No TMDB ID specified"});
        return;
    }
    const data = await getTvShowFromID(tmdbId);
    const episode = parseInt(req.query['episode'] as string ?? '1');
    const season = parseInt(req.query['season'] as string ?? '1');
    const out = await scrapeEpisode(data, season, episode, req.query['source'] as string).catch(()=>undefined);
    if(out) {
        res.statusCode = 200;
        res.send(out);
        return;
    }
    res.statusCode = 404;
    res.send({error: "Not found"});
});
