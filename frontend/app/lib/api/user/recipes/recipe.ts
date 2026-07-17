import { SSE } from "sse.js";
import type { SSEvent } from "sse.js";
import { BaseCRUDAPI } from "../../base/base-clients";
import { route } from "../../base";
import { CommentsApi } from "./recipe-comments";
import { RecipeShareApi } from "./recipe-share";
import type {
  Recipe,
  CreateRecipe,
  RecipeAsset,
  CreateRecipeByUrlBulk,
  ParsedIngredient,
  UpdateImageResponse,
  RecipeLastMade,
  RecipeSuggestionQuery,
  RecipeSuggestionResponse,
  RecipeTimelineEventIn,
  RecipeTimelineEventOut,
  RecipeTimelineEventUpdate,
} from "~/lib/api/types/recipe";
import type { SSEDataEventDone, SSEDataEventMessage } from "~/lib/api/types/response";
import { flushListCache } from "~/composables/recipes/use-list-cache";
import type {
  ApiRequestInstance,
  NutritionEstimate,
  PaginationData,
  RequestResponse,
} from "~/lib/api/types/non-generated";
import { SSEDataEventStatus } from "~/lib/api/types/non-generated";

export type Parser = "nlp" | "brute" | "openai";

export interface CreateAsset {
  name: string;
  icon: string;
  extension: string;
  file: File;
}

const prefix = "/api";

const routes = {
  recipesCreate: `${prefix}/recipes/create`,
  recipesBase: `${prefix}/recipes`,
  recipesSuggestions: `${prefix}/recipes/suggestions`,
  recipesTestScrapeUrl: `${prefix}/recipes/test-scrape-url`,
  recipesCreateUrl: `${prefix}/recipes/create/url/stream`,
  recipesCreateUrlBulk: `${prefix}/recipes/create/url/bulk`,
  recipesCreateFromZip: `${prefix}/recipes/create/zip`,
  recipesCreateFromImage: `${prefix}/recipes/create/image`,
  recipesCreateFromHtmlOrJson: `${prefix}/recipes/create/html-or-json/stream`,
  recipesCategory: `${prefix}/recipes/category`,
  recipesParseIngredient: `${prefix}/parser/ingredient`,
  recipesParseIngredients: `${prefix}/parser/ingredients`,
  recipesTimelineEvent: `${prefix}/recipes/timeline/events`,

  recipesRecipeSlug: (recipe_slug: string) => `${prefix}/recipes/${recipe_slug}`,
  recipesRecipeSlugImage: (recipe_slug: string) => `${prefix}/recipes/${recipe_slug}/image`,
  recipesRecipeSlugAssets: (recipe_slug: string) => `${prefix}/recipes/${recipe_slug}/assets`,

  recipesSlugComments: (slug: string) => `${prefix}/recipes/${slug}/comments`,
  recipesSlugCommentsId: (slug: string, id: number) => `${prefix}/recipes/${slug}/comments/${id}`,

  recipesSlugLastMade: (slug: string) => `${prefix}/recipes/${slug}/last-made`,
  recipesSlugEstimateNutrition: (slug: string) => `${prefix}/recipes/${slug}/estimate-nutrition`,
  recipesTimelineEventId: (id: string) => `${prefix}/recipes/timeline/events/${id}`,
  recipesTimelineEventIdImage: (id: string) => `${prefix}/recipes/timeline/events/${id}/image`,
};

export type RecipeSearchQuery = {
  search?: string;
  orderDirection?: "asc" | "desc";
  groupId?: string;

  queryFilter?: string;

  cookbook?: string;
  households?: string[];

  categories?: string[];
  requireAllCategories?: boolean;

  tags?: string[];
  requireAllTags?: boolean;

  tools?: string[];
  requireAllTools?: boolean;

  foods?: string[];
  requireAllFoods?: boolean;

  page?: number;
  perPage?: number;
  orderBy?: string;
  orderByNullPosition?: "first" | "last";

  _searchSeed?: string;
};

export class RecipeAPI extends BaseCRUDAPI<CreateRecipe, Recipe, Recipe> {
  baseRoute: string = routes.recipesBase;
  itemRoute = routes.recipesRecipeSlug;

  comments: CommentsApi;
  share: RecipeShareApi;

  constructor(requests: ApiRequestInstance) {
    super(requests);

    this.comments = new CommentsApi(requests);
    this.share = new RecipeShareApi(requests);
  }

  // ---- SWR invalidation --------------------------------------------------------------------
  // Every recipe mutation flushes the list cache HERE, at the one place all of them pass
  // through, rather than at each of the many call sites (edit page, category menu, share-target
  // import, estimator accept...). A missed site wouldn't error — it would let a cached grid
  // resurrect a card Ethan just unfiled, silently. Reads never flush.

  async createOne(payload: CreateRecipe) {
    flushListCache();
    return await super.createOne(payload);
  }

  async updateOne(itemId: string | number, payload: Recipe) {
    flushListCache();
    return await super.updateOne(itemId, payload);
  }

  async patchOne(itemId: string, payload: Partial<Recipe>) {
    flushListCache();
    return await super.patchOne(itemId, payload);
  }

  async deleteOne(itemId: string | number) {
    flushListCache();
    return await super.deleteOne(itemId);
  }

  async search(rsq: RecipeSearchQuery) {
    return await this.requests.get<PaginationData<Recipe>>(route(routes.recipesBase, rsq));
  }

  async getAllByCategory(categories: string[]) {
    return await this.requests.get<Recipe[]>(routes.recipesCategory, {
      categories,
    });
  }

  async getSuggestions(q: RecipeSuggestionQuery, foods: string[] | null = null, tools: string[] | null = null) {
    return await this.requests.get<RecipeSuggestionResponse>(
      route(routes.recipesSuggestions, { ...q, foods, tools }),
    );
  }

  async createAsset(recipeSlug: string, payload: CreateAsset) {
    const formData = new FormData();
    formData.append("file", payload.file);
    formData.append("name", payload.name);
    formData.append("extension", payload.extension);
    formData.append("icon", payload.icon);

    return await this.requests.post<RecipeAsset>(routes.recipesRecipeSlugAssets(recipeSlug), formData);
  }

  updateImage(slug: string, fileObject: File) {
    const formData = new FormData();
    formData.append("image", fileObject);
    formData.append("extension", fileObject.name.split(".").pop() ?? "");

    return this.requests.put<UpdateImageResponse, FormData>(routes.recipesRecipeSlugImage(slug), formData);
  }

  updateImagebyURL(slug: string, url: string) {
    return this.requests.post<UpdateImageResponse>(routes.recipesRecipeSlugImage(slug), { url });
  }

  deleteImage(slug: string) {
    return this.requests.delete<string>(routes.recipesRecipeSlugImage(slug));
  }

  async testCreateOneUrl(url: string, useOpenAI = false) {
    return await this.requests.post<Recipe | null>(routes.recipesTestScrapeUrl, { url, useOpenAI });
  }

  private streamRecipeCreate(streamRoute: string, payload: object, onProgress?: (message: string) => void): Promise<RequestResponse<string>> {
    // Covers every streaming create (by URL, by HTML/JSON) in one place, incl. the share target.
    flushListCache();
    return new Promise((resolve) => {
      const { token } = useMealieAuth();

      const sse = new SSE(streamRoute, {
        headers: {
          "Content-Type": "application/json",
          ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
        },
        payload: JSON.stringify(payload),
        withCredentials: true,
        autoReconnect: false,
      });

      if (onProgress) {
        sse.addEventListener(SSEDataEventStatus.Progress, (e: SSEvent) => {
          const { message } = JSON.parse(e.data) as SSEDataEventMessage;
          onProgress(message);
        });
      }

      sse.addEventListener(SSEDataEventStatus.Done, (e: SSEvent) => {
        const { slug } = JSON.parse(e.data) as SSEDataEventDone;
        sse.close();
        resolve({ response: { status: 201, data: slug } as any, data: slug, error: null });
      });

      sse.addEventListener(SSEDataEventStatus.Error, (e: SSEvent) => {
        try {
          const { message } = JSON.parse(e.data) as SSEDataEventMessage;
          sse.close();
          resolve({ response: null, data: null, error: new Error(message) });
        }
        catch {
          // Not a backend error payload (e.g. XHR connection-close event); ignore
        }
      });

      sse.stream();
    });
  }

  async createOneByHtmlOrJson(
    data: string,
    includeTags: boolean,
    includeCategories: boolean,
    url: string | null = null,
    onProgress?: (message: string) => void,
  ): Promise<RequestResponse<string>> {
    return this.streamRecipeCreate(routes.recipesCreateFromHtmlOrJson, { data, includeTags, includeCategories, url }, onProgress);
  }

  async createOneByUrl(
    url: string,
    includeTags: boolean,
    includeCategories: boolean,
    onProgress?: (message: string) => void,
  ): Promise<RequestResponse<string>> {
    return this.streamRecipeCreate(routes.recipesCreateUrl, { url, includeTags, includeCategories }, onProgress);
  }

  async createManyByUrl(payload: CreateRecipeByUrlBulk) {
    flushListCache();
    return await this.requests.post<string>(routes.recipesCreateUrlBulk, payload);
  }

  async createOneFromImages(fileObjects: (Blob | File)[], translateLanguage: string | null = null) {
    const formData = new FormData();

    fileObjects.forEach((file) => {
      formData.append("images", file);
    });

    let apiRoute = routes.recipesCreateFromImage;
    if (translateLanguage) {
      apiRoute = `${apiRoute}?translateLanguage=${translateLanguage}`;
    }

    flushListCache();
    return await this.requests.post<string>(apiRoute, formData);
  }

  async parseIngredients(parser: Parser, ingredients: Array<string>) {
    parser = parser || "nlp";
    return await this.requests.post<ParsedIngredient[]>(routes.recipesParseIngredients, { parser, ingredients });
  }

  async parseIngredient(parser: Parser, ingredient: string) {
    parser = parser || "nlp";
    return await this.requests.post<ParsedIngredient>(routes.recipesParseIngredient, { parser, ingredient });
  }

  async updateMany(payload: Recipe[]) {
    flushListCache();
    return await this.requests.put<Recipe[]>(routes.recipesBase, payload);
  }

  async patchMany(payload: Recipe[]) {
    // The quick-categorize menu and the unfile-vanish both mutate through here, so this one
    // flush is what keeps a cached grid from resurrecting a card Ethan just unfiled.
    flushListCache();
    return await this.requests.patch<Recipe[]>(routes.recipesBase, payload);
  }

  async updateLastMade(recipeSlug: string, timestamp: string) {
    // last-made affects ordering under the last-made sort, so cached lists are stale too
    flushListCache();
    return await this.requests.patch<Recipe, RecipeLastMade>(routes.recipesSlugLastMade(recipeSlug), { timestamp });
  }

  /**
   * Ask the AI provider for per-serving macros. Returns the estimate without saving, so the
   * numbers can be reviewed first; the caller writes them with a normal recipe update.
   *
   * One recipe per call, on demand. The provider is on a free tier metered per project
   * (~15 RPM), so never map this over a list — the importer drives it throttled from outside.
   */
  async estimateNutrition(recipeSlug: string) {
    return await this.requests.post<NutritionEstimate, { save: boolean }>(
      routes.recipesSlugEstimateNutrition(recipeSlug),
      { save: false },
    );
  }

  async createTimelineEvent(payload: RecipeTimelineEventIn) {
    return await this.requests.post<RecipeTimelineEventOut>(routes.recipesTimelineEvent, payload);
  }

  async updateTimelineEvent(eventId: string, payload: RecipeTimelineEventUpdate) {
    return await this.requests.put<RecipeTimelineEventOut, RecipeTimelineEventUpdate>(
      routes.recipesTimelineEventId(eventId),
      payload,
    );
  }

  async deleteTimelineEvent(eventId: string) {
    return await this.requests.delete<RecipeTimelineEventOut>(routes.recipesTimelineEventId(eventId));
  }

  async getAllTimelineEvents(page = 1, perPage = -1, params = {} as any) {
    return await this.requests.get<PaginationData<RecipeTimelineEventOut>>(
      routes.recipesTimelineEvent, { page, perPage, ...params },
    );
  }

  async updateTimelineEventImage(eventId: string, fileObject: Blob | File, fileName: string) {
    const formData = new FormData();
    formData.append("image", fileObject);
    formData.append("extension", fileName.split(".").pop() ?? "");

    return await this.requests.put<UpdateImageResponse, FormData>(routes.recipesTimelineEventIdImage(eventId), formData);
  }
}
