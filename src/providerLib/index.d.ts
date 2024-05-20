import * as FormData_2 from 'form-data';

export declare function buildProviders(): ProviderBuilder;

declare type Caption = {
    type: CaptionType;
    id: string;
    url: string;
    hasCorsRestrictions: boolean;
    language: string;
};

declare type CaptionType = keyof typeof captionTypes;

declare const captionTypes: {
    srt: string;
    vtt: string;
};

declare type CommonMedia = {
    title: string;
    releaseYear: number;
    imdbId?: string;
    tmdbId: string;
};

export declare type DefaultedFetcherOptions = {
    baseUrl?: string;
    body?: Record<string, any> | string | FormData_2;
    headers: Record<string, string>;
    query: Record<string, string>;
    readHeaders: string[];
    method: 'HEAD' | 'GET' | 'POST';
};

declare type DiscoverEmbedsEvent = {
    sourceId: string;
    embeds: Array<{
        id: string;
        embedScraperId: string;
    }>;
};

declare type Embed = EmbedOptions & {
    type: 'embed';
    disabled: boolean;
    mediaTypes: undefined;
};

declare type EmbedInput = {
    url: string;
};

export declare type EmbedOptions = {
    id: string;
    name: string;
    rank: number;
    disabled?: boolean;
    scrape: (input: EmbedScrapeContext) => Promise<EmbedOutput>;
};

export declare type EmbedOutput = {
    stream: Stream[];
};

export declare interface EmbedRunnerOptions {
    events?: IndividualScraperEvents;
    url: string;
    id: string;
}

export declare type EmbedScrapeContext = EmbedInput & ScrapeContext;

export declare type Fetcher = {
    <T = any>(url: string, ops: DefaultedFetcherOptions): Promise<FetcherResponse<T>>;
};

export declare type FetcherOptions = {
    baseUrl?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    method?: 'HEAD' | 'GET' | 'POST';
    readHeaders?: string[];
    body?: Record<string, any> | string | FormData_2 | URLSearchParams;
};

export declare type FetcherResponse<T = any> = {
    statusCode: number;
    headers: Headers;
    finalUrl: string;
    body: T;
};

declare type FetchHeaders = {
    get(key: string): string | null;
    set(key: string, value: string): void;
};

declare type FetchLike = (url: string, ops?: FetchOps | undefined) => Promise<FetchReply>;

/**
 * This file is a very relaxed definition of the fetch api
 * Only containing what we need for it to function.
 */
declare type FetchOps = {
    headers: Record<string, string>;
    method: string;
    body: any;
};

declare type FetchReply = {
    text(): Promise<string>;
    json(): Promise<any>;
    extraHeaders?: FetchHeaders;
    extraUrl?: string;
    headers: FetchHeaders;
    url: string;
    status: number;
};

export declare type FileBasedStream = StreamCommon & {
    type: 'file';
    qualities: Partial<Record<Qualities, StreamFile>>;
};

export declare type Flags = (typeof flags)[keyof typeof flags];

export declare const flags: {
    readonly CORS_ALLOWED: "cors-allowed";
    readonly IP_LOCKED: "ip-locked";
    readonly CF_BLOCKED: "cf-blocked";
};

export declare type FullScraperEvents = {
    update?: (evt: UpdateEvent) => void;
    init?: (evt: InitEvent) => void;
    discoverEmbeds?: (evt: DiscoverEmbedsEvent) => void;
    start?: (id: string) => void;
};

export declare function getBuiltinEmbeds(): Embed[];

export declare function getBuiltinSources(): Sourcerer[];

export declare type HlsBasedStream = StreamCommon & {
    type: 'hls';
    playlist: string;
};

declare type IndividualScraperEvents = {
    update?: (evt: UpdateEvent) => void;
};

declare type InitEvent = {
    sourceIds: string[];
};

export declare function makeProviders(ops: ProviderMakerOptions): ProviderControls;

export declare function makeSimpleProxyFetcher(proxyUrl: string, f: FetchLike): Fetcher;

export declare function makeStandardFetcher(f: FetchLike): Fetcher;

declare type MediaScraperTypes = 'show' | 'movie';

export declare type MediaTypes = 'show' | 'movie';

export declare type MetaOutput = {
    type: 'embed' | 'source';
    id: string;
    rank: number;
    name: string;
    mediaTypes?: Array<MediaTypes>;
};

export declare type MovieMedia = CommonMedia & {
    type: 'movie';
};

export declare type MovieScrapeContext = ScrapeContext & {
    media: MovieMedia;
};

export declare class NotFoundError extends Error {
    constructor(reason?: string);
}

export declare type ProviderBuilder = {
    setTarget(target: Targets): ProviderBuilder;
    setFetcher(fetcher: Fetcher): ProviderBuilder;
    setProxiedFetcher(fetcher: Fetcher): ProviderBuilder;
    addSource(scraper: Sourcerer): ProviderBuilder;
    addSource(name: string): ProviderBuilder;
    addEmbed(scraper: Embed): ProviderBuilder;
    addEmbed(name: string): ProviderBuilder;
    addBuiltinProviders(): ProviderBuilder;
    enableConsistentIpForRequests(): ProviderBuilder;
    build(): ProviderControls;
};

export declare interface ProviderControls {
    runAll(runnerOps: RunnerOptions): Promise<RunOutput | null>;
    runSourceScraper(runnerOps: SourceRunnerOptions): Promise<SourcererOutput>;
    runEmbedScraper(runnerOps: EmbedRunnerOptions): Promise<EmbedOutput>;
    getMetadata(id: string): MetaOutput | null;
    listSources(): MetaOutput[];
    listEmbeds(): MetaOutput[];
}

export declare interface ProviderMakerOptions {
    fetcher: Fetcher;
    proxiedFetcher?: Fetcher;
    target: Targets;
    consistentIpForRequests?: boolean;
}

export declare type Qualities = 'unknown' | '360' | '480' | '720' | '1080' | '4k';

export declare interface RunnerOptions {
    sourceOrder?: string[];
    embedOrder?: string[];
    events?: FullScraperEvents;
    media: ScrapeMedia;
}

export declare type RunOutput = {
    sourceId: string;
    embedId?: string;
    stream: Stream;
};

export declare type ScrapeContext = {
    proxiedFetcher: UseableFetcher;
    fetcher: UseableFetcher;
    progress(val: number): void;
};

export declare type ScrapeMedia = ShowMedia | MovieMedia;

export declare type ShowMedia = CommonMedia & {
    type: 'show';
    episode: {
        number: number;
        tmdbId: string;
    };
    season: {
        number: number;
        tmdbId: string;
    };
};

export declare type ShowScrapeContext = ScrapeContext & {
    media: ShowMedia;
};

declare type Sourcerer = SourcererOptions & {
    type: 'source';
    disabled: boolean;
    mediaTypes: MediaScraperTypes[];
};

declare type SourcererEmbed = {
    embedId: string;
    url: string;
};

export declare type SourcererOptions = {
    id: string;
    name: string;
    rank: number;
    disabled?: boolean;
    flags: Flags[];
    scrapeMovie?: (input: MovieScrapeContext) => Promise<SourcererOutput>;
    scrapeShow?: (input: ShowScrapeContext) => Promise<SourcererOutput>;
};

export declare type SourcererOutput = {
    embeds: SourcererEmbed[];
    stream?: Stream[];
};

export declare interface SourceRunnerOptions {
    events?: IndividualScraperEvents;
    media: ScrapeMedia;
    id: string;
}

export declare type Stream = FileBasedStream | HlsBasedStream;

declare type StreamCommon = {
    id: string;
    flags: Flags[];
    captions: Caption[];
    thumbnailTrack?: ThumbnailTrack;
    headers?: Record<string, string>;
    preferredHeaders?: Record<string, string>;
};

export declare type StreamFile = {
    type: 'mp4';
    url: string;
};

export declare type Targets = (typeof targets)[keyof typeof targets];

export declare const targets: {
    readonly BROWSER: "browser";
    readonly BROWSER_EXTENSION: "browser-extension";
    readonly NATIVE: "native";
    readonly ANY: "any";
};

declare type ThumbnailTrack = {
    type: 'vtt';
    url: string;
};

declare type UpdateEvent = {
    id: string;
    percentage: number;
    status: UpdateEventStatus;
    error?: unknown;
    reason?: string;
};

declare type UpdateEventStatus = 'success' | 'failure' | 'notfound' | 'pending';

declare type UseableFetcher = {
    <T = any>(url: string, ops?: FetcherOptions): Promise<T>;
    full: <T = any>(url: string, ops?: FetcherOptions) => Promise<FetcherResponse<T>>;
};

export { }
