const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Pop-Culture Market Templates
 * 15+ markets covering awards shows, movies, music, and entertainment
 */

module.exports = [
  // ========================================
  // OSCARS 2026 (98th Academy Awards - March 2026)
  // ========================================
  {
    question: "Will 'Sinners' win Best Picture at the 98th Academy Awards?",
    description:
      "The 98th Academy Awards (Oscars 2026) will be held in March 2026. 'Sinners' leads with a record 16 nominations.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.WinLose,
    tags: ["Oscars", "Academy Awards", "2026", "Best Picture", "Sinners"],
    resolutionCriteria:
      "Resolves YES if 'Sinners' wins Best Picture at the 98th Academy Awards. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 15) },
    correlationGroupId: "oscars-2026",
    correlationGroupName: "98th Academy Awards",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will 'Conclave' win Best Picture at the Oscars 2026?",
    description:
      "The 98th Academy Awards feature a new Best Casting award for the first time.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.WinLose,
    tags: ["Oscars", "Academy Awards", "2026", "Best Picture", "Conclave"],
    resolutionCriteria:
      "Resolves YES if 'Conclave' wins Best Picture. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 15) },
    correlationGroupId: "oscars-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will the new Best Casting award go to a drama film?",
    description:
      "The 98th Academy Awards introduces Achievement in Casting as a new category for the first time in Oscar history.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.YesNo,
    tags: ["Oscars", "Casting", "2026", "New Award"],
    resolutionCriteria:
      "Resolves YES if the first Best Casting Oscar goes to a drama film. Resolves NO if comedy, action, or other genre.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 15) },
    correlationGroupId: "oscars-2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will a streaming platform film win Best Picture in 2026?",
    description:
      "Streaming services like Netflix, Apple TV+, and Amazon have increasingly competed for major awards.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.YesNo,
    tags: ["Oscars", "Streaming", "Netflix", "2026"],
    resolutionCriteria:
      "Resolves YES if a streaming-first release wins Best Picture. Resolves NO if theatrical release wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 15) },
    correlationGroupId: "oscars-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // GRAMMY AWARDS (February 2026)
  // ========================================
  {
    question: "Will Taylor Swift win Album of the Year at the 2026 Grammys?",
    description:
      "Taylor Swift has won Album of the Year four times, more than any other artist.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.WinLose,
    tags: ["Grammys", "Taylor Swift", "Album of the Year", "2026"],
    resolutionCriteria:
      "Resolves YES if Taylor Swift wins Album of the Year at the 2026 Grammy Awards. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 8) },
    correlationGroupId: "grammys-2026",
    correlationGroupName: "2026 Grammy Awards",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will a hip-hop artist win Record of the Year at the 2026 Grammys?",
    description:
      "Record of the Year honors the overall production of a single track.",
    category: "pop-culture",
    subcategory: "awards",
    betType: BET_TYPES.YesNo,
    tags: ["Grammys", "Hip-Hop", "Record of the Year", "2026"],
    resolutionCriteria:
      "Resolves YES if the Record of the Year winner is primarily a hip-hop/rap artist. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 8) },
    correlationGroupId: "grammys-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // MUSIC RELEASES & TOURS
  // ========================================
  {
    question: "Will Taylor Swift release a new album in 2026?",
    description:
      "Taylor Swift has maintained a prolific release schedule. Re-recordings and new albums continue.",
    category: "pop-culture",
    subcategory: "music",
    betType: BET_TYPES.YesNo,
    tags: ["Taylor Swift", "Album", "2026", "Music"],
    resolutionCriteria:
      "Resolves YES if Taylor Swift releases a new studio album in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "music-2026",
    correlationGroupName: "Music 2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Beyonce announce a new tour in 2026?",
    description:
      "Major artist tours are significant events. Beyonce's Renaissance World Tour was a massive success.",
    category: "pop-culture",
    subcategory: "music",
    betType: BET_TYPES.YesNo,
    tags: ["Beyonce", "Tour", "2026", "Music"],
    resolutionCriteria:
      "Resolves YES if Beyonce announces a new world tour in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "music-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // MOVIES & BOX OFFICE
  // ========================================
  {
    question: "Will any 2026 movie gross over $2 billion worldwide?",
    description:
      "Only a handful of films have crossed $2B. Major franchises and event films have the best chance.",
    category: "pop-culture",
    subcategory: "movies",
    betType: BET_TYPES.YesNo,
    tags: ["Box Office", "Movies", "2026", "$2 Billion"],
    resolutionCriteria:
      "Resolves YES if any 2026 theatrical release grosses $2B+ worldwide. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 2, 1) },
    correlationGroupId: "movies-2026",
    correlationGroupName: "Movies 2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will a Marvel movie be the #1 film of 2026?",
    description:
      "Marvel has dominated box office charts, though recent performance has been mixed.",
    category: "pop-culture",
    subcategory: "movies",
    betType: BET_TYPES.YesNo,
    tags: ["Marvel", "Box Office", "2026", "MCU"],
    resolutionCriteria:
      "Resolves YES if a Marvel Studios film is the highest-grossing movie of 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 15) },
    correlationGroupId: "movies-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // TV SHOWS
  // ========================================
  {
    question: "Will a new streaming show get 100M+ views in its first week in 2026?",
    description:
      "Streaming viewership records continue to be broken by major releases.",
    category: "pop-culture",
    subcategory: "tv-shows",
    betType: BET_TYPES.YesNo,
    tags: ["Streaming", "TV", "Viewership", "2026"],
    resolutionCriteria:
      "Resolves YES if any new streaming show reaches 100M+ view hours in first week. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "tv-2026",
    correlationGroupName: "TV 2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will a Game of Thrones spinoff premiere in 2026?",
    description:
      "HBO has multiple GoT spinoffs in development. Release dates vary.",
    category: "pop-culture",
    subcategory: "tv-shows",
    betType: BET_TYPES.YesNo,
    tags: ["Game of Thrones", "HBO", "Spinoff", "2026"],
    resolutionCriteria:
      "Resolves YES if any new Game of Thrones spinoff series premieres in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "tv-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // CELEBRITIES
  // ========================================
  {
    question: "Will a major celebrity couple announce divorce in 2026?",
    description:
      "Celebrity relationships are closely followed by media. Major couples are defined by combined social following of 100M+.",
    category: "pop-culture",
    subcategory: "celebrities",
    betType: BET_TYPES.YesNo,
    tags: ["Celebrity", "Divorce", "2026"],
    resolutionCriteria:
      "Resolves YES if a celebrity couple with 100M+ combined followers announces divorce. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "celebrity-2026",
    liquidity: { min: "50", max: "150" },
  },

  // ========================================
  // EVERGREEN POP-CULTURE TEMPLATES
  // ========================================
  {
    question: "Will a song stay #1 on Billboard Hot 100 for 10+ weeks this quarter?",
    description:
      "Extended chart runs are rare. Only exceptional hits maintain #1 for extended periods.",
    category: "pop-culture",
    subcategory: "music",
    betType: BET_TYPES.YesNo,
    tags: ["Billboard", "Charts", "Music"],
    resolutionCriteria:
      "Resolves YES if any song stays #1 on Hot 100 for 10+ consecutive weeks this quarter. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 90 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will the weekend box office exceed $200 million this weekend?",
    description:
      "Major releases can push total weekend box office past $200M. Summer and holiday weekends are strongest.",
    category: "pop-culture",
    subcategory: "movies",
    betType: BET_TYPES.AboveBelow,
    tags: ["Box Office", "Movies", "Weekend"],
    resolutionCriteria:
      "Resolves YES if domestic weekend box office exceeds $200M. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 7 },
    liquidity: { min: "50", max: "100" },
  },
  {
    question: "Will a music video reach 100M YouTube views in 24 hours this month?",
    description:
      "24-hour YouTube records are highly competitive among major artists.",
    category: "pop-culture",
    subcategory: "music",
    betType: BET_TYPES.YesNo,
    tags: ["YouTube", "Music Video", "Records"],
    resolutionCriteria:
      "Resolves YES if any music video gets 100M+ YouTube views in first 24 hours this month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "100" },
  },
];
