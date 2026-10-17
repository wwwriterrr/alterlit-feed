import { createContext, useContext } from 'react';
import type { Viewer } from './types';

export interface FeedContextValue {
  /** раздел ленты — ключ кеша RTK Query */
  section: string;
  viewer: Viewer;
}

export const ANON: Viewer = { id: null, can_change: false, can_delete: false, can_add: false, can_hide: false };

export const FeedContext = createContext<FeedContextValue>({ section: 'index', viewer: ANON });

export const useFeedContext = () => useContext(FeedContext);
