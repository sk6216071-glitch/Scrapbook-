import gdflixProvider from './gdflix.js';
import genericProvider from './generic.js';

class ProviderRegistry {
  constructor() {
    this.providers = [
      gdflixProvider,
      genericProvider
    ];
  }

  register(provider) {
    this.providers.unshift(provider); // Priority to newer/specific providers
  }

  getProvider(url) {
    for (const p of this.providers) {
      if (p.match(url)) {
        return p;
      }
    }
    return genericProvider;
  }
}

export const providerRegistry = new ProviderRegistry();
export default providerRegistry;
