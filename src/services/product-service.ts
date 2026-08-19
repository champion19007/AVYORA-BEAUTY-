
/**
 * @fileOverview ProductService handles all business logic related to Avyora clinical formulations.
 * It abstracts data access to allow for easy integration with a Firebase backend.
 */

import { PRODUCTS, Product } from '@/data/mock-data';

/**
 * Service for managing product data and inventory intelligence.
 */
export class ProductService {
  private static instance: ProductService;
  private products: Product[] = [...PRODUCTS];

  private constructor() {}

  /**
   * Returns the singleton instance of the ProductService.
   */
  public static getInstance(): ProductService {
    if (!ProductService.instance) {
      ProductService.instance = new ProductService();
    }
    return ProductService.instance;
  }

  /**
   * Retrieves all available clinical formulations.
   * @returns {Product[]} Array of all products.
   */
  public getAllProducts(): Product[] {
    return this.products;
  }

  /**
   * Finds a specific formulation by its unique identifier.
   * @param {string} id - The SKU ID.
   * @returns {Product | undefined} The found product or undefined.
   */
  public getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  /**
   * Updates the pricing for a specific SKU.
   * In a real implementation, this would call Firestore.
   * @param {string} id - The SKU ID.
   * @param {number} newPrice - The new clinical unit price.
   */
  public updateProductPrice(id: string, newPrice: number): void {
    const index = this.products.findIndex(p => p.id === id);
    if (index !== -1) {
      this.products[index] = {
        ...this.products[index],
        price: newPrice
      };
      // Logic for backend sync would go here:
      // await setDoc(doc(db, 'products', id), { price: newPrice }, { merge: true });
    }
  }

  /**
   * Generates simulated historical performance data for a specific product.
   * Used for SKU-level data visualization.
   * @param {string} productId - The ID of the product.
   * @returns {any[]} Array of data points for Recharts.
   */
  public getProductSimulatedPerformance(productId: string) {
    const baseValue = Math.floor(Math.random() * 50) + 20;
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      volume: baseValue + Math.floor(Math.random() * 20) - 10,
      conversion: (Math.random() * 5 + 2).toFixed(1)
    }));
  }
}
