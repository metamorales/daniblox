/*
 * Negative fixture for the architecture boundary rule.
 *
 * src/render must never import from src/ui. This file does exactly that on
 * purpose so `npm run check:boundary` can prove the ESLint rule fires. It is in
 * the global ESLint ignore list, so `eslint .` stays clean, and nothing in the
 * app imports it.
 */
import { Wordmark } from '../../src/ui/Wordmark';

export const deliberatelyForbidden = Wordmark;
