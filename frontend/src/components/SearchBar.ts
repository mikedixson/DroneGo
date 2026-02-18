import { apiClient } from '../services/api-client.js';
import type { SearchResult } from '../types/api.js';

/**
 * SearchBar Component
 * 
 * Provides address/postcode search functionality for UK locations.
 * US2: FR-011 - Enable search for future flight locations
 */
export class SearchBar {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private searchButton: HTMLButtonElement;
  private resultsContainer: HTMLElement;
  private isSearching: boolean = false;
  private onResultSelect: ((lat: number, lon: number, displayName: string) => void) | null = null;

  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`SearchBar container not found: ${containerId}`);
    }
    this.container = element;

    // Create search UI
    this.container.innerHTML = `
      <div class="search-bar">
        <input 
          type="text" 
          id="search-input" 
          class="search-input" 
          placeholder="Search by postcode or address (e.g., SW1A 1AA, London)" 
          autocomplete="off"
        />
        <button id="search-button" class="search-button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <circle cx="8.5" cy="8.5" r="5.5" stroke-width="2"/>
            <path d="M12.5 12.5L16.5 16.5" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div id="search-results" class="search-results" style="display: none;"></div>
      </div>
    `;

    this.input = document.getElementById('search-input') as HTMLInputElement;
    this.searchButton = document.getElementById('search-button') as HTMLButtonElement;
    this.resultsContainer = document.getElementById('search-results') as HTMLElement;

    this.attachEventListeners();
  }

  /**
   * Set callback for when a search result is selected
   */
  onSelect(callback: (lat: number, lon: number, displayName: string) => void): void {
    this.onResultSelect = callback;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Search on button click
    this.searchButton.addEventListener('click', () => {
      this.performSearch();
    });

    // Search on Enter key
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.performSearch();
      }
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.hideResults();
      }
    });

    // Show results on input focus if they exist
    this.input.addEventListener('focus', () => {
      if (this.resultsContainer.children.length > 0) {
        this.resultsContainer.style.display = 'block';
      }
    });
  }

  /**
   * Perform location search
   */
  private async performSearch(): Promise<void> {
    const query = this.input.value.trim();

    if (query.length < 2) {
      this.showError('Please enter at least 2 characters');
      return;
    }

    if (this.isSearching) {
      return; // Prevent duplicate searches
    }

    this.isSearching = true;
    this.searchButton.disabled = true;
    this.searchButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" class="spinner">
        <circle cx="10" cy="10" r="8" stroke-width="2" stroke-dasharray="50" stroke-dashoffset="0"/>
      </svg>
    `;

    try {
      const result: SearchResult = await apiClient.searchLocation(query, 5);

      if (result.results.length === 0) {
        this.showError('No locations found. Try a different search term.');
        return;
      }

      this.displayResults(result.results);
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Search failed. Please try again.');
    } finally {
      this.isSearching = false;
      this.searchButton.disabled = false;
      this.searchButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <circle cx="8.5" cy="8.5" r="5.5" stroke-width="2"/>
          <path d="M12.5 12.5L16.5 16.5" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    }
  }

  /**
   * Display search results
   */
  private displayResults(results: SearchResult['results']): void {
    this.resultsContainer.innerHTML = results
      .map(
        (result, index) => `
        <div class="search-result-item" data-index="${index}">
          <div class="result-name">${this.escapeHtml(result.display_name)}</div>
          <div class="result-type">${this.formatType(result.type)}</div>
        </div>
      `
      )
      .join('');

    // Attach click handlers to results
    results.forEach((result, index) => {
      const item = this.resultsContainer.querySelector(
        `[data-index="${index}"]`
      ) as HTMLElement;
      if (item) {
        item.addEventListener('click', () => {
          this.selectResult(result);
        });
      }
    });

    this.resultsContainer.style.display = 'block';
  }

  /**
   * Handle result selection
   */
  private selectResult(result: SearchResult['results'][0]): void {
    this.input.value = result.display_name;
    this.hideResults();

    if (this.onResultSelect) {
      this.onResultSelect(result.lat, result.lon, result.display_name);
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.resultsContainer.innerHTML = `
      <div class="search-error">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="#f44336" stroke-width="2"/>
          <path d="M8 4v5" stroke="#f44336" stroke-width="2" stroke-linecap="round"/>
          <circle cx="8" cy="11" r="0.5" fill="#f44336"/>
        </svg>
        <span>${this.escapeHtml(message)}</span>
      </div>
    `;
    this.resultsContainer.style.display = 'block';

    // Auto-hide error after 3 seconds
    setTimeout(() => {
      this.hideResults();
    }, 3000);
  }

  /**
   * Hide search results
   */
  private hideResults(): void {
    this.resultsContainer.style.display = 'none';
  }

  /**
   * Clear search input
   */
  clear(): void {
    this.input.value = '';
    this.hideResults();
  }

  /**
   * Format place type for display
   */
  private formatType(type: string): string {
    const typeMap: Record<string, string> = {
      postcode: 'Postcode',
      city: 'City',
      town: 'Town',
      village: 'Village',
      suburb: 'Suburb',
      road: 'Street',
      house: 'Address',
      building: 'Building',
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destroy component and remove event listeners
   */
  destroy(): void {
    this.searchButton.removeEventListener('click', () => {});
    this.input.removeEventListener('keypress', () => {});
    this.container.innerHTML = '';
  }
}
