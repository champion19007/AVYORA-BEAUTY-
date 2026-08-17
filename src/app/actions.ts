'use server';

import { suggestPaymentMethod } from '@/ai/flows/suggest-payment-method';

/**
 * Server action to get a payment method suggestion from the AI flow.
 * In a real-world scenario, this would fetch historical data from a database.
 */
export async function getPaymentSuggestion() {
  // Sample historical data to provide context to the AI.
  // In a production app, you would fetch this from Firestore based on the authenticated user.
  const sampleHistory = [
    { paymentMethod: 'Visa **** 4242', amount: 49.00, timestamp: '2023-12-01T10:00:00Z' },
    { paymentMethod: 'PayPal', amount: 19.99, timestamp: '2023-11-01T14:30:00Z' },
    { paymentMethod: 'Visa **** 4242', amount: 49.00, timestamp: '2023-10-01T09:15:00Z' },
    { paymentMethod: 'Visa **** 4242', amount: 19.99, timestamp: '2023-09-01T11:00:00Z' },
  ];

  try {
    const result = await suggestPaymentMethod({
      userId: 'user-placeholder',
      paymentHistory: sampleHistory,
    });
    return result;
  } catch (error) {
    return {
      suggestedPaymentMethod: 'Error',
      reason: 'The AI was unable to generate a suggestion at this time.',
    };
  }
}

export async function exampleAction() {
  return { message: 'Hello from the server!' };
}
