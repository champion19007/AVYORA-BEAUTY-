'use server';

/**
 * @fileOverview A flow that suggests a preferred payment method based on the user's historical payment data.
 *
 * - suggestPaymentMethod - A function that suggests a payment method.
 * - SuggestPaymentMethodInput - The input type for the suggestPaymentMethod function.
 * - SuggestPaymentMethodOutput - The return type for the suggestPaymentMethod function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestPaymentMethodInputSchema = z.object({
  userId: z.string().describe('The ID of the user.'),
  paymentHistory: z.array(z.object({
    paymentMethod: z.string().describe('The payment method used (e.g., credit card, PayPal).'),
    amount: z.number().describe('The amount of the payment.'),
    timestamp: z.string().describe('The timestamp of the payment (ISO format).'),
  })).describe('The user historical payment data.'),
});
export type SuggestPaymentMethodInput = z.infer<typeof SuggestPaymentMethodInputSchema>;

const SuggestPaymentMethodOutputSchema = z.object({
  suggestedPaymentMethod: z.string().describe('The suggested payment method based on historical data.'),
  reason: z.string().describe('The reasoning behind the suggested payment method.'),
});
export type SuggestPaymentMethodOutput = z.infer<typeof SuggestPaymentMethodOutputSchema>;

export async function suggestPaymentMethod(input: SuggestPaymentMethodInput): Promise<SuggestPaymentMethodOutput> {
  return suggestPaymentMethodFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPaymentMethodPrompt',
  input: {schema: SuggestPaymentMethodInputSchema},
  output: {schema: SuggestPaymentMethodOutputSchema},
  prompt: `You are a payment method suggestion expert. Based on the user's payment history, you will suggest the most convenient payment method for them.

Payment History:
{{#each paymentHistory}}
- Payment Method: {{paymentMethod}}, Amount: {{amount}}, Timestamp: {{timestamp}}
{{/each}}

Consider the frequency and amounts of past payments when suggesting a payment method.

Respond in a JSON format with the suggested payment method and a brief explanation.
`,
});

const suggestPaymentMethodFlow = ai.defineFlow(
  {
    name: 'suggestPaymentMethodFlow',
    inputSchema: SuggestPaymentMethodInputSchema,
    outputSchema: SuggestPaymentMethodOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
