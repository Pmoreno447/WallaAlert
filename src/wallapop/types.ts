/** Filtros de búsqueda. El nombre de cada uno en la URL se define en config.json (`api.filterParams`). */
export interface SearchFilters {
  minPrice?: number;
  maxPrice?: number;
  categoryId?: number;
  subcategoryId?: number;
}

export interface WallapopImage {
  id: string;
  urls: { small: string; medium: string; big: string };
}

export interface WallapopItem {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category_id: number;
  price: { amount: number; currency: string };
  images: WallapopImage[];
  reserved: { flag: boolean };
  location: { city: string; region: string; postal_code: string; country_code: string };
  shipping: { item_is_shippable: boolean; user_allows_shipping: boolean };
  web_slug: string;
  /** Timestamp en milisegundos. */
  created_at: number;
  /** Timestamp en milisegundos. */
  modified_at: number;
  taxonomy: { id: number; name: string }[];
}

export interface WallapopSearchResponse {
  data: { section: { payload: { items: WallapopItem[] } } };
}
