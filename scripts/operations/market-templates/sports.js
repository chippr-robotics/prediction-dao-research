const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Sports Market Templates
 * 25+ markets covering major 2026 sporting events
 */

module.exports = [
  // ========================================
  // SUPER BOWL LX (February 8, 2026)
  // ========================================
  {
    question: "Will the Seattle Seahawks win Super Bowl LX?",
    description:
      "Super Bowl LX will be played on February 8, 2026 at Levi's Stadium in Santa Clara, CA. The Seattle Seahawks (NFC) face the New England Patriots (AFC).",
    category: "sports",
    subcategory: "nfl",
    betType: BET_TYPES.WinLose,
    tags: ["NFL", "Super Bowl", "Seahawks", "2026", "Championship"],
    resolutionCriteria:
      "Resolves YES if Seattle Seahawks win Super Bowl LX. Resolves NO if New England Patriots win. Market cancels if game is not played or ends in a tie after overtime.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 9) },
    correlationGroupId: "super-bowl-lx",
    correlationGroupName: "Super Bowl LX",
    liquidity: { min: "300", max: "500" },
  },
  {
    question: "Will the Super Bowl LX total score be over 45.5 points?",
    description:
      "Combined total points scored by both teams in Super Bowl LX. Seahawks vs Patriots at Levi's Stadium.",
    category: "sports",
    subcategory: "nfl",
    betType: BET_TYPES.OverUnder,
    tags: ["NFL", "Super Bowl", "Total Points", "Over/Under"],
    resolutionCriteria:
      "Resolves YES if combined score exceeds 45.5. Resolves NO if 45 or fewer total points. Includes overtime if played.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 9) },
    correlationGroupId: "super-bowl-lx",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the Super Bowl LX MVP be a quarterback?",
    description:
      "The Super Bowl MVP award is voted on by a panel of journalists. Recent MVPs have often been quarterbacks.",
    category: "sports",
    subcategory: "nfl",
    betType: BET_TYPES.YesNo,
    tags: ["NFL", "Super Bowl", "MVP", "Quarterback"],
    resolutionCriteria:
      "Resolves YES if the official Super Bowl LX MVP plays the quarterback position. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 9) },
    correlationGroupId: "super-bowl-lx",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // WINTER OLYMPICS (February 6-22, 2026)
  // ========================================
  {
    question: "Will the USA lead the gold medal count at Milano Cortina 2026?",
    description:
      "The 2026 Winter Olympics in Milano Cortina, Italy runs February 6-22. Competition includes 16 sports with 116 medal events.",
    category: "sports",
    subcategory: "olympics",
    betType: BET_TYPES.YesNo,
    tags: ["Olympics", "Winter 2026", "USA", "Gold Medals", "Milano Cortina"],
    resolutionCriteria:
      "Resolves YES if USA has the most gold medals at the closing ceremony. Resolves NO otherwise. Ties broken by total medal count.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 23) },
    correlationGroupId: "winter-olympics-2026-medals",
    correlationGroupName: "2026 Winter Olympics Medal Count",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Norway win more than 35 total medals at the Winter Olympics?",
    description:
      "Norway historically dominates Winter Olympics. They won 37 medals in Beijing 2022.",
    category: "sports",
    subcategory: "olympics",
    betType: BET_TYPES.OverUnder,
    tags: ["Olympics", "Winter 2026", "Norway", "Medal Count"],
    resolutionCriteria:
      "Resolves YES if Norway wins 36+ total medals. Resolves NO if 35 or fewer.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 23) },
    correlationGroupId: "winter-olympics-2026-medals",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will a world record be broken in speed skating at the 2026 Olympics?",
    description:
      "Speed skating events at Milano Cortina include 500m, 1000m, 1500m, 5000m, 10000m, and team pursuit.",
    category: "sports",
    subcategory: "olympics",
    betType: BET_TYPES.YesNo,
    tags: ["Olympics", "Winter 2026", "Speed Skating", "World Record"],
    resolutionCriteria:
      "Resolves YES if any speed skating world record is broken during Olympic competition. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 23) },
    correlationGroupId: "winter-olympics-2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will USA Hockey win a medal at the 2026 Winter Olympics?",
    description:
      "Both men's and women's USA hockey teams compete at Milano Cortina 2026.",
    category: "sports",
    subcategory: "olympics",
    betType: BET_TYPES.YesNo,
    tags: ["Olympics", "Winter 2026", "Hockey", "USA", "Medal"],
    resolutionCriteria:
      "Resolves YES if either USA men's or women's hockey team wins gold, silver, or bronze. Resolves NO if neither team medals.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 2, 23) },
    correlationGroupId: "winter-olympics-2026",
    liquidity: { min: "150", max: "250" },
  },

  // ========================================
  // NBA FINALS (June 3-19, 2026)
  // ========================================
  {
    question: "Will the NBA Finals 2026 go to 7 games?",
    description:
      "The 2026 NBA Finals are scheduled June 3-19. First team to win 4 games takes the championship.",
    category: "sports",
    subcategory: "nba",
    betType: BET_TYPES.YesNo,
    tags: ["NBA", "Finals", "2026", "Game 7"],
    resolutionCriteria:
      "Resolves YES if a 7th game is played in the 2026 NBA Finals. Resolves NO if series ends in 4, 5, or 6 games.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 20) },
    correlationGroupId: "nba-finals-2026",
    correlationGroupName: "2026 NBA Finals",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will an Eastern Conference team win the 2026 NBA Championship?",
    description:
      "The NBA Finals pit the Eastern Conference champion against the Western Conference champion.",
    category: "sports",
    subcategory: "nba",
    betType: BET_TYPES.YesNo,
    tags: ["NBA", "Finals", "2026", "Eastern Conference", "Championship"],
    resolutionCriteria:
      "Resolves YES if the Eastern Conference champion wins the 2026 NBA Finals. Resolves NO if Western Conference wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 20) },
    correlationGroupId: "nba-finals-2026",
    liquidity: { min: "250", max: "450" },
  },
  {
    question: "Will the 2026 NBA Finals MVP average 30+ points per game?",
    description:
      "Finals MVP is awarded to the most outstanding player of the championship series.",
    category: "sports",
    subcategory: "nba",
    betType: BET_TYPES.OverUnder,
    tags: ["NBA", "Finals", "2026", "MVP", "Points"],
    resolutionCriteria:
      "Resolves YES if the Finals MVP averages 30.0 or more points per game during the Finals. Resolves NO if under 30.0 PPG.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 20) },
    correlationGroupId: "nba-finals-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // FIFA WORLD CUP 2026 (June 11 - July 19)
  // ========================================
  {
    question: "Will the host nation (USA, Mexico, or Canada) win the 2026 World Cup?",
    description:
      "The 2026 FIFA World Cup is co-hosted by USA, Mexico, and Canada. The final is at MetLife Stadium on July 19.",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.YesNo,
    tags: ["World Cup", "2026", "FIFA", "USA", "Mexico", "Canada"],
    resolutionCriteria:
      "Resolves YES if USA, Mexico, or Canada wins the 2026 World Cup Final. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 7, 20) },
    correlationGroupId: "world-cup-2026",
    correlationGroupName: "2026 FIFA World Cup",
    liquidity: { min: "300", max: "500" },
  },
  {
    question: "Will Brazil win the 2026 FIFA World Cup?",
    description:
      "Brazil is a five-time World Cup winner and perennial favorite. The 48-team tournament runs June 11-July 19.",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.WinLose,
    tags: ["World Cup", "2026", "FIFA", "Brazil"],
    resolutionCriteria:
      "Resolves YES if Brazil wins the 2026 World Cup Final. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 7, 20) },
    correlationGroupId: "world-cup-2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will France reach the World Cup 2026 Semi-Finals?",
    description:
      "France is the defending champion (2018 winner) and reached the 2022 final.",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.YesNo,
    tags: ["World Cup", "2026", "FIFA", "France", "Semi-Finals"],
    resolutionCriteria:
      "Resolves YES if France advances to the semi-finals or beyond. Resolves NO if eliminated before semi-finals.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 7, 16) },
    correlationGroupId: "world-cup-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will the World Cup 2026 Golden Boot winner score 10+ goals?",
    description:
      "The Golden Boot is awarded to the tournament's top scorer. With expanded 48-team format, more games means more goals.",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.OverUnder,
    tags: ["World Cup", "2026", "FIFA", "Golden Boot", "Goals"],
    resolutionCriteria:
      "Resolves YES if the Golden Boot winner scores 10 or more goals. Resolves NO if under 10 goals.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 7, 20) },
    correlationGroupId: "world-cup-2026",
    liquidity: { min: "150", max: "250" },
  },
  {
    question: "Will the USA advance past the Group Stage at World Cup 2026?",
    description:
      "As a host nation, the USA automatically qualifies. They must finish in the top 2 of their group to advance.",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.YesNo,
    tags: ["World Cup", "2026", "FIFA", "USA", "Group Stage"],
    resolutionCriteria:
      "Resolves YES if USA advances to the knockout round. Resolves NO if eliminated in group stage.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 30) },
    correlationGroupId: "world-cup-2026",
    liquidity: { min: "200", max: "350" },
  },
  {
    question: "Will Argentina defend their World Cup title in 2026?",
    description:
      "Argentina won the 2022 World Cup in Qatar. No team has won back-to-back World Cups since Brazil (1958, 1962).",
    category: "sports",
    subcategory: "soccer",
    betType: BET_TYPES.YesNo,
    tags: ["World Cup", "2026", "FIFA", "Argentina", "Defending Champion"],
    resolutionCriteria:
      "Resolves YES if Argentina wins the 2026 World Cup Final. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 7, 20) },
    correlationGroupId: "world-cup-2026",
    liquidity: { min: "200", max: "400" },
  },

  // ========================================
  // MLB WORLD SERIES (October 2026)
  // ========================================
  {
    question: "Will the New York Yankees win the 2026 World Series?",
    description:
      "The 2026 MLB World Series is expected in late October. The Yankees have 27 championships, the most in MLB history.",
    category: "sports",
    subcategory: "mlb",
    betType: BET_TYPES.WinLose,
    tags: ["MLB", "World Series", "2026", "Yankees", "Baseball"],
    resolutionCriteria:
      "Resolves YES if New York Yankees win the 2026 World Series. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 1) },
    correlationGroupId: "mlb-world-series-2026",
    correlationGroupName: "2026 MLB World Series",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the 2026 World Series go to 7 games?",
    description:
      "The World Series is a best-of-7 championship between the AL and NL pennant winners.",
    category: "sports",
    subcategory: "mlb",
    betType: BET_TYPES.YesNo,
    tags: ["MLB", "World Series", "2026", "Game 7"],
    resolutionCriteria:
      "Resolves YES if a 7th game is played. Resolves NO if series ends in 4, 5, or 6 games.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 1) },
    correlationGroupId: "mlb-world-series-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will an American League team win the 2026 World Series?",
    description:
      "The AL has won 12 of the last 20 World Series championships.",
    category: "sports",
    subcategory: "mlb",
    betType: BET_TYPES.YesNo,
    tags: ["MLB", "World Series", "2026", "American League"],
    resolutionCriteria:
      "Resolves YES if an American League team wins. Resolves NO if National League wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 1) },
    correlationGroupId: "mlb-world-series-2026",
    liquidity: { min: "200", max: "350" },
  },

  // ========================================
  // NHL STANLEY CUP (June 2026)
  // ========================================
  {
    question: "Will a Canadian team win the 2026 Stanley Cup?",
    description:
      "No Canadian team has won the Stanley Cup since Montreal in 1993. There are 7 Canadian NHL teams.",
    category: "sports",
    subcategory: "nhl",
    betType: BET_TYPES.YesNo,
    tags: ["NHL", "Stanley Cup", "2026", "Canada", "Hockey"],
    resolutionCriteria:
      "Resolves YES if a Canadian-based NHL team wins the 2026 Stanley Cup. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 25) },
    correlationGroupId: "nhl-2026",
    correlationGroupName: "2026 NHL Stanley Cup",
    liquidity: { min: "200", max: "400" },
  },

  // ========================================
  // FORMULA 1 (2026 Season)
  // ========================================
  {
    question: "Will Max Verstappen win the 2026 F1 World Championship?",
    description:
      "Max Verstappen has won multiple consecutive championships. 2026 features major regulation changes.",
    category: "sports",
    subcategory: "formula-1",
    betType: BET_TYPES.WinLose,
    tags: ["F1", "Formula 1", "2026", "Verstappen", "Championship"],
    resolutionCriteria:
      "Resolves YES if Max Verstappen wins the 2026 F1 Drivers' Championship. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 15) },
    correlationGroupId: "f1-2026",
    correlationGroupName: "2026 Formula 1 Season",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will a new team win an F1 race in 2026?",
    description:
      "2026 features major regulation changes that could shuffle the competitive order.",
    category: "sports",
    subcategory: "formula-1",
    betType: BET_TYPES.YesNo,
    tags: ["F1", "Formula 1", "2026", "New Winner"],
    resolutionCriteria:
      "Resolves YES if a constructor that has never won an F1 race wins in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 15) },
    correlationGroupId: "f1-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // EVERGREEN SPORTS TEMPLATES
  // ========================================
  {
    question: "Will a major upset occur in this week's NFL games?",
    description:
      "An upset is defined as a team favored by 10+ points losing. Evergreen market for weekly NFL action.",
    category: "sports",
    subcategory: "nfl",
    betType: BET_TYPES.YesNo,
    tags: ["NFL", "Upset", "Weekly"],
    resolutionCriteria:
      "Resolves YES if any team favored by 10+ points loses during the current NFL week. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 7 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will there be a perfect game pitched in MLB this month?",
    description:
      "A perfect game occurs when no opposing batter reaches base. Extremely rare in baseball.",
    category: "sports",
    subcategory: "mlb",
    betType: BET_TYPES.YesNo,
    tags: ["MLB", "Perfect Game", "Rare Event"],
    resolutionCriteria:
      "Resolves YES if a perfect game is thrown in MLB during the current month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "100" },
  },
];
