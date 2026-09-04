export type RouteName = 'landing' | 'join' | 'play' | 'host-login' | 'host-game' | 'not-found';

export interface RouteMatch {
  name: RouteName;
  params: Record<string, string>;
}

function matchPath(pathname: string): RouteMatch {
  const path = pathname.replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return { name: 'landing', params: {} };

  if (segments[0] === 'join') {
    if (segments.length === 1) return { name: 'join', params: {} };
    if (segments.length === 2) return { name: 'join', params: { code: segments[1].toUpperCase() } };
  }

  if (segments[0] === 'play' && segments.length === 1) return { name: 'play', params: {} };

  if (segments[0] === 'host') {
    if (segments.length === 1) return { name: 'host-login', params: {} };
    if (segments.length === 3 && segments[1] === 'game') {
      return { name: 'host-game', params: { code: segments[2].toUpperCase() } };
    }
  }

  return { name: 'not-found', params: {} };
}

class Router {
  current = $state<RouteMatch>(matchPath(typeof window === 'undefined' ? '/' : window.location.pathname));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.current = matchPath(window.location.pathname);
      });
    }
  }

  navigate(to: string, options: { replace?: boolean } = {}): void {
    if (typeof window === 'undefined') return;
    const target = to.startsWith('/') ? to : `/${to}`;
    if (options.replace) {
      window.history.replaceState({}, '', target);
    } else {
      window.history.pushState({}, '', target);
    }
    this.current = matchPath(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

export const router = new Router();

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  router.navigate(to, options);
}
