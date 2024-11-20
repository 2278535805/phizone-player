/*
    The text to display underneath the combo counter.
*/
export const COMBO_TEXT = 'COMBO';

/*
    The size of click effects.
*/
export const CLICK_EFFECTS_SIZE = 1;

/*
    The size of click effects particles, which will be scaled by CLICK_EFFECTS_SIZE.
*/
export const CLICK_EFFECTS_PARTICLE_SIZE = 27;

/*
    The sidelength (in pixels) of the square area in which the click effects particles will be
    randomly scattered, which will be scaled by CLICK_EFFECTS_SIZE.
*/
export const CLICK_EFFECTS_PARTICLE_SPREAD_RANGE = 600;

/*
    The font family to use in the game.
*/
export const FONT_FAMILY = 'Outfit';

/*
    The base size of notes, which will be scaled by the note size from the preferences.
*/
export const NOTE_BASE_SIZE = 0.16;

/*
    Minimum velocity (in chart pixels per second) required to Perfect a Flick note.
*/
export const FLICK_VELOCTY_THRESHOLD = 5;

/*
    Maximum no-input interval (in milliseconds) allowed before a Hold note is considered missed.
*/
export const HOLD_BODY_TOLERANCE = 100;

/*
    Interval (in milliseconds) between the end of a Hold note and the judgment time of the note.
*/
export const HOLD_TAIL_TOLERANCE = 100;

/*
    Minimum distance (in chart pixels) between the projections of the input and a note along
    the judgment line required to hit the note.
*/
export const JUDGEMENT_THRESHOLD = 200;

/*
    The radius (in pixels) of rounded corners of the illustration on the ending scene.
*/
export const ENDING_ILLUSTRATION_CORNER_RADIUS = 20;
