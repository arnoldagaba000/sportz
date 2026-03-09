import { MATCH_STATUS } from "../validation/matches.js";

/**
 * Returns the match status given the start and end times of the match.
 * @param {Date|string} startTime - The start time of the match.
 * @param {Date|string} endTime - The end time of the match.
 * @param {Date} [now] - The current time. Defaults to the current time.
 * @returns {string|null} The match status. If the start or end times are invalid, returns null.
 */
export function getMatchStatus(startTime, endTime, now = new Date()) {
	const start = new Date(startTime);
	const end = new Date(endTime);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return null;
	}

	if (now < start) {
		return MATCH_STATUS.SCHEDULED;
	}

	if (now >= end) {
		return MATCH_STATUS.FINISHED;
	}

	return MATCH_STATUS.LIVE;
}

/**
 * Syncs the match status with the current time.
 * If the match status changes, calls updateStatus with the new status.
 * @param {object} match - The match object to sync.
 * @param {function} updateStatus - The function to call when the match status changes.
 * @returns {string} The synced match status.
 */
export async function syncMatchStatus(match, updateStatus) {
	const nextStatus = getMatchStatus(match.startTime, match.endTime);
	if (!nextStatus) {
		return match.status;
	}
	if (match.status !== nextStatus) {
		await updateStatus(nextStatus);
		match.status = nextStatus;
	}
	return match.status;
}