import * as THREE from 'three';

export const AI_DICE_CENTER = new THREE.Vector3(3.3, 0, -1.2);

/** Your dice sit in a straight line along the near edge of the table, left to right. */
export const PLAYER_ROW_START = -4.5;
export const PLAYER_ROW_SPACING = 1.2;
export const PLAYER_ROW_Z = 3.05;

/**
 * Your hand guards your dice the way a hand naturally does: forearm along the
 * table, hand continuing straight on from it turned on its edge with the
 * thumb up, palm toward you and the fingers curled over the dice, so the monk
 * sees only the back of it.
 */
export const PLAYER_HAND_REST = new THREE.Vector3(-5.1, 0.9, 0.8);
export const PLAYER_HAND_FINGERS = new THREE.Vector3(0.985, 0.03, 0.12);
export const PLAYER_HAND_BACK = new THREE.Vector3(0, 0.12, -1);

export const OPPONENT_X = 4.7;
export const OPPONENT_Z = -3.8;
