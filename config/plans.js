const PLANS = {
    free: {
        title: "FREE",
        stars: 0,
        maxChannels: 1,
        maxPostsPerDay: 5,
        canCustomPrompt: false,
        description: "• 1 канал\n• 5 постів на день\n• без зміни промпту"
    },
    basic: {
        title: "BASIC",
        stars: 200,
        maxChannels: 3,
        maxPostsPerDay: 30,
        canCustomPrompt: true,
        description: "• 3 канали\n• 30 постів на день\n• зміна AI промпту"
    },
    pro: {
        title: "PRO",
        stars: 500,
        maxChannels: 10,
        maxPostsPerDay: 100,
        canCustomPrompt: true,
        description: "• 10 каналів\n• 100 постів на день\n• зміна AI промпту"
    },
    business: {
        title: "BUSINESS",
        stars: 1,
        maxChannels: 100,
        maxPostsPerDay: 9999,
        canCustomPrompt: true,
        description: "• безліміт каналів\n• безліміт постів\n• зміна AI промпту"
    }
};

module.exports = PLANS;