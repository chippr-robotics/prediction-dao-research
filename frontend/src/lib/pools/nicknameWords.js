/**
 * Versioned adjective/noun vocabulary for ZK-Wager Pool nicknames (spec 034, FR-009/FR-012).
 *
 * Nicknames are a deterministic function of a member's PUBLIC identity commitment (so any member can
 * render every member's nickname for leaderboards). Bump NICKNAME_VERSION only deliberately — changing
 * these arrays changes everyone's nickname. 64×64 = 4096 base combinations; a commitment-derived suffix
 * disambiguates the rare in-pool collision.
 */
export const NICKNAME_VERSION = 1

export const ADJECTIVES = [
  'Prismatic', 'Thunder', 'Velvet', 'Cobalt', 'Golden', 'Silent', 'Crimson', 'Lunar',
  'Solar', 'Frost', 'Ember', 'Jade', 'Amber', 'Onyx', 'Coral', 'Ivory',
  'Mellow', 'Brave', 'Swift', 'Clever', 'Noble', 'Wild', 'Gentle', 'Fierce',
  'Cosmic', 'Electric', 'Mystic', 'Radiant', 'Shadow', 'Stellar', 'Vivid', 'Zephyr',
  'Azure', 'Scarlet', 'Emerald', 'Copper', 'Marble', 'Quartz', 'Sable', 'Topaz',
  'Daring', 'Quiet', 'Lucky', 'Royal', 'Rapid', 'Sunny', 'Misty', 'Bold',
  'Arctic', 'Desert', 'Coastal', 'Highland', 'Crystal', 'Iron', 'Velour', 'Plum',
  'Nimble', 'Stoic', 'Breezy', 'Hazel', 'Ruby', 'Sage', 'Indigo', 'Pearl',
]

export const NOUNS = [
  'Fox', 'Eagle', 'Tiger', 'Otter', 'Falcon', 'Wolf', 'Heron', 'Lynx',
  'Bear', 'Hawk', 'Raven', 'Stag', 'Bison', 'Crane', 'Moose', 'Panther',
  'Dolphin', 'Badger', 'Marlin', 'Gecko', 'Cobra', 'Mantis', 'Beetle', 'Sparrow',
  'Comet', 'Nebula', 'Meteor', 'Quasar', 'Aurora', 'Cyclone', 'Glacier', 'Canyon',
  'River', 'Summit', 'Harbor', 'Meadow', 'Thicket', 'Boulder', 'Lagoon', 'Delta',
  'Anchor', 'Lantern', 'Compass', 'Beacon', 'Saber', 'Quiver', 'Catapult', 'Helm',
  'Maple', 'Cedar', 'Willow', 'Birch', 'Aspen', 'Juniper', 'Cypress', 'Sequoia',
  'Phoenix', 'Griffin', 'Kraken', 'Pegasus', 'Hydra', 'Sphinx', 'Wyvern', 'Drake',
]
