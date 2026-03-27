/**
 * Returns transition parameters that respect prefers-reduced-motion.
 * When reduced motion is preferred, duration and delay are set to 0.
 */
export function motionParams(
	duration: number,
	delay: number = 0
): { duration: number; delay: number } {
	if (typeof window === 'undefined') {
		return { duration: 0, delay: 0 };
	}
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	return reduced ? { duration: 0, delay: 0 } : { duration, delay };
}
