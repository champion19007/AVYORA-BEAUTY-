'use server';

import { suggestPaymentMethod } from '@/ai/flows/suggest-payment-method';
import type { SuggestPaymentMethodOutput } from '@/ai/flows/suggest-payment-method';

// Mock payment history data for demonstration
const mockPaymentHistory = [
  { paymentMethod: 'Credit Card', amount: 49.99, timestamp: '2023-10-01T10:00:00Z' },
  { paymentMethod: 'PayPal', amount: 19.99, timestamp: '2023-10-15T14:30:00Z' },
  { paymentMethod: 'Credit Card', amount: 49.99, timestamp: '2023-11-01T10:00:00Z' },
  { paymentMethod: 'Credit Card', amount: 25.00, timestamp: '2023-11-05T12:00:00Z' },
  { paymentMethod: 'PayPal', amount: 19.99, timestamp: '2023-11-15T14:30:00Z' },
  { paymentMethod: 'Credit Card', amount: 49.99, timestamp: '2023-12-01T10:00:00Z' },
  { paymentMethod: 'PayPal', amount: 99.00, timestamp: '2024-01-10T18:00:00Z' },
  { paymentMethod: 'Credit Card', amount: 49.99, timestamp: '2024-01-15T10:00:00Z' },
];

export async function getPaymentSuggestion(): Promise<SuggestPaymentMethodOutput> {
  try {
    const suggestion = await suggestPaymentMethod({
      userId: 'user-123',
      paymentHistory: mockPaymentHistory,
    });
    return suggestion;
  } catch (error) {
    console.error('Error getting payment suggestion:', error);
    return {
      suggestedPaymentMethod: 'Error',
      reason: 'Could not fetch suggestion from AI. Please try again later.',
    };
  }
}
