/**
 * Zod schemas + inferred TS types for the TibiaData API v4.
 *
 * Source of truth: https://docs.tibiadata.com (Swagger 2.0 / v4.10.0)
 * Self-host or fallback to public — shape is identical either way.
 *
 * Schemas are kept permissive on optional fields (nullable/optional unions)
 * because TibiaData occasionally returns empty arrays/objects for unknown
 * races or unavailable data. We trust the shape, not the value.
 */
import { z } from "zod";
declare const InformationSchema: z.ZodObject<{
    api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        commit?: string | null | undefined;
        release?: string | null | undefined;
        version?: number | null | undefined;
    }, {
        commit?: string | null | undefined;
        release?: string | null | undefined;
        version?: number | null | undefined;
    }>>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        error: z.ZodNumber;
        http_code: z.ZodNumber;
        message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        error: number;
        http_code: number;
        message?: string | null | undefined;
    }, {
        error: number;
        http_code: number;
        message?: string | null | undefined;
    }>>>;
    tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    status?: {
        error: number;
        http_code: number;
        message?: string | null | undefined;
    } | null | undefined;
    api?: {
        commit?: string | null | undefined;
        release?: string | null | undefined;
        version?: number | null | undefined;
    } | null | undefined;
    tibia_urls?: string[] | undefined;
    timestamp?: string | null | undefined;
}, {
    status?: {
        error: number;
        http_code: number;
        message?: string | null | undefined;
    } | null | undefined;
    api?: {
        commit?: string | null | undefined;
        release?: string | null | undefined;
        version?: number | null | undefined;
    } | null | undefined;
    tibia_urls?: string[] | undefined;
    timestamp?: string | null | undefined;
}>;
export type Information = z.infer<typeof InformationSchema>;
declare const CharacterInfoSchema: z.ZodObject<{
    account_status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    achievement_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    comment: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    deletion_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    former_names: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    former_worlds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    guild: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        rank: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        rank?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        rank?: string | null | undefined;
    }>>>;
    houses: z.ZodOptional<z.ZodArray<z.ZodObject<{
        houseid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        paid: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        houseid?: number | null | undefined;
        paid?: string | null | undefined;
        town?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        houseid?: number | null | undefined;
        paid?: string | null | undefined;
        town?: string | null | undefined;
    }>, "many">>;
    last_login: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    married_to: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    residence: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    sex: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    unlocked_titles: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    vocation?: string | null | undefined;
    sex?: string | null | undefined;
    world?: string | null | undefined;
    guild?: {
        name?: string | null | undefined;
        rank?: string | null | undefined;
    } | null | undefined;
    houses?: {
        name?: string | null | undefined;
        houseid?: number | null | undefined;
        paid?: string | null | undefined;
        town?: string | null | undefined;
    }[] | undefined;
    position?: string | null | undefined;
    account_status?: string | null | undefined;
    achievement_points?: number | null | undefined;
    comment?: string | null | undefined;
    deletion_date?: string | null | undefined;
    former_names?: string[] | undefined;
    former_worlds?: string[] | undefined;
    last_login?: string | null | undefined;
    married_to?: string | null | undefined;
    residence?: string | null | undefined;
    title?: string | null | undefined;
    traded?: boolean | null | undefined;
    unlocked_titles?: number | null | undefined;
}, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    vocation?: string | null | undefined;
    sex?: string | null | undefined;
    world?: string | null | undefined;
    guild?: {
        name?: string | null | undefined;
        rank?: string | null | undefined;
    } | null | undefined;
    houses?: {
        name?: string | null | undefined;
        houseid?: number | null | undefined;
        paid?: string | null | undefined;
        town?: string | null | undefined;
    }[] | undefined;
    position?: string | null | undefined;
    account_status?: string | null | undefined;
    achievement_points?: number | null | undefined;
    comment?: string | null | undefined;
    deletion_date?: string | null | undefined;
    former_names?: string[] | undefined;
    former_worlds?: string[] | undefined;
    last_login?: string | null | undefined;
    married_to?: string | null | undefined;
    residence?: string | null | undefined;
    title?: string | null | undefined;
    traded?: boolean | null | undefined;
    unlocked_titles?: number | null | undefined;
}>;
declare const CharacterSchema: z.ZodObject<{
    account_badges: z.ZodOptional<z.ZodArray<z.ZodObject<{
        description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        icon_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        icon_url?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        icon_url?: string | null | undefined;
    }>, "many">>;
    account_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        created: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        loyalty_title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        created?: string | null | undefined;
        loyalty_title?: string | null | undefined;
        position?: string | null | undefined;
    }, {
        created?: string | null | undefined;
        loyalty_title?: string | null | undefined;
        position?: string | null | undefined;
    }>>>;
    achievements: z.ZodOptional<z.ZodArray<z.ZodObject<{
        grade: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        secret: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        grade?: number | null | undefined;
        secret?: boolean | null | undefined;
    }, {
        name?: string | null | undefined;
        grade?: number | null | undefined;
        secret?: boolean | null | undefined;
    }>, "many">>;
    character: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        account_status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        achievement_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        comment: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        deletion_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        former_names: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        former_worlds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        guild: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rank: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        }>>>;
        houses: z.ZodOptional<z.ZodArray<z.ZodObject<{
            houseid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            paid: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }>, "many">>;
        last_login: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        married_to: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        residence: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        sex: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        unlocked_titles: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        sex?: string | null | undefined;
        world?: string | null | undefined;
        guild?: {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        } | null | undefined;
        houses?: {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }[] | undefined;
        position?: string | null | undefined;
        account_status?: string | null | undefined;
        achievement_points?: number | null | undefined;
        comment?: string | null | undefined;
        deletion_date?: string | null | undefined;
        former_names?: string[] | undefined;
        former_worlds?: string[] | undefined;
        last_login?: string | null | undefined;
        married_to?: string | null | undefined;
        residence?: string | null | undefined;
        title?: string | null | undefined;
        traded?: boolean | null | undefined;
        unlocked_titles?: number | null | undefined;
    }, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        sex?: string | null | undefined;
        world?: string | null | undefined;
        guild?: {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        } | null | undefined;
        houses?: {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }[] | undefined;
        position?: string | null | undefined;
        account_status?: string | null | undefined;
        achievement_points?: number | null | undefined;
        comment?: string | null | undefined;
        deletion_date?: string | null | undefined;
        former_names?: string[] | undefined;
        former_worlds?: string[] | undefined;
        last_login?: string | null | undefined;
        married_to?: string | null | undefined;
        residence?: string | null | undefined;
        title?: string | null | undefined;
        traded?: boolean | null | undefined;
        unlocked_titles?: number | null | undefined;
    }>>>;
    deaths: z.ZodOptional<z.ZodArray<z.ZodObject<{
        assists: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            player: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            summon: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }>, "many">>;
        killers: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            player: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            summon: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }>, "many">>;
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        reason: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        time: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        level?: number | null | undefined;
        assists?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        killers?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        reason?: string | null | undefined;
        time?: string | null | undefined;
    }, {
        level?: number | null | undefined;
        assists?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        killers?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        reason?: string | null | undefined;
        time?: string | null | undefined;
    }>, "many">>;
    deaths_truncated: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    other_characters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        deleted: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        main: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        status?: string | null | undefined;
        world?: string | null | undefined;
        position?: string | null | undefined;
        traded?: boolean | null | undefined;
        deleted?: boolean | null | undefined;
        main?: boolean | null | undefined;
    }, {
        name?: string | null | undefined;
        status?: string | null | undefined;
        world?: string | null | undefined;
        position?: string | null | undefined;
        traded?: boolean | null | undefined;
        deleted?: boolean | null | undefined;
        main?: boolean | null | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    character?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        sex?: string | null | undefined;
        world?: string | null | undefined;
        guild?: {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        } | null | undefined;
        houses?: {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }[] | undefined;
        position?: string | null | undefined;
        account_status?: string | null | undefined;
        achievement_points?: number | null | undefined;
        comment?: string | null | undefined;
        deletion_date?: string | null | undefined;
        former_names?: string[] | undefined;
        former_worlds?: string[] | undefined;
        last_login?: string | null | undefined;
        married_to?: string | null | undefined;
        residence?: string | null | undefined;
        title?: string | null | undefined;
        traded?: boolean | null | undefined;
        unlocked_titles?: number | null | undefined;
    } | null | undefined;
    account_badges?: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        icon_url?: string | null | undefined;
    }[] | undefined;
    account_information?: {
        created?: string | null | undefined;
        loyalty_title?: string | null | undefined;
        position?: string | null | undefined;
    } | null | undefined;
    achievements?: {
        name?: string | null | undefined;
        grade?: number | null | undefined;
        secret?: boolean | null | undefined;
    }[] | undefined;
    deaths?: {
        level?: number | null | undefined;
        assists?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        killers?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        reason?: string | null | undefined;
        time?: string | null | undefined;
    }[] | undefined;
    deaths_truncated?: boolean | null | undefined;
    other_characters?: {
        name?: string | null | undefined;
        status?: string | null | undefined;
        world?: string | null | undefined;
        position?: string | null | undefined;
        traded?: boolean | null | undefined;
        deleted?: boolean | null | undefined;
        main?: boolean | null | undefined;
    }[] | undefined;
}, {
    character?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        sex?: string | null | undefined;
        world?: string | null | undefined;
        guild?: {
            name?: string | null | undefined;
            rank?: string | null | undefined;
        } | null | undefined;
        houses?: {
            name?: string | null | undefined;
            houseid?: number | null | undefined;
            paid?: string | null | undefined;
            town?: string | null | undefined;
        }[] | undefined;
        position?: string | null | undefined;
        account_status?: string | null | undefined;
        achievement_points?: number | null | undefined;
        comment?: string | null | undefined;
        deletion_date?: string | null | undefined;
        former_names?: string[] | undefined;
        former_worlds?: string[] | undefined;
        last_login?: string | null | undefined;
        married_to?: string | null | undefined;
        residence?: string | null | undefined;
        title?: string | null | undefined;
        traded?: boolean | null | undefined;
        unlocked_titles?: number | null | undefined;
    } | null | undefined;
    account_badges?: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        icon_url?: string | null | undefined;
    }[] | undefined;
    account_information?: {
        created?: string | null | undefined;
        loyalty_title?: string | null | undefined;
        position?: string | null | undefined;
    } | null | undefined;
    achievements?: {
        name?: string | null | undefined;
        grade?: number | null | undefined;
        secret?: boolean | null | undefined;
    }[] | undefined;
    deaths?: {
        level?: number | null | undefined;
        assists?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        killers?: {
            name?: string | null | undefined;
            traded?: boolean | null | undefined;
            player?: boolean | null | undefined;
            summon?: string | null | undefined;
        }[] | undefined;
        reason?: string | null | undefined;
        time?: string | null | undefined;
    }[] | undefined;
    deaths_truncated?: boolean | null | undefined;
    other_characters?: {
        name?: string | null | undefined;
        status?: string | null | undefined;
        world?: string | null | undefined;
        position?: string | null | undefined;
        traded?: boolean | null | undefined;
        deleted?: boolean | null | undefined;
        main?: boolean | null | undefined;
    }[] | undefined;
}>;
export declare const CharacterResponseSchema: z.ZodObject<{
    character: z.ZodNullable<z.ZodObject<{
        account_badges: z.ZodOptional<z.ZodArray<z.ZodObject<{
            description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            icon_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }>, "many">>;
        account_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            created: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            loyalty_title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        }, {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        }>>>;
        achievements: z.ZodOptional<z.ZodArray<z.ZodObject<{
            grade: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            secret: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }, {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }>, "many">>;
        character: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            account_status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            achievement_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            comment: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            deletion_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            former_names: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            former_worlds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            guild: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                rank: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            }, {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            }>>>;
            houses: z.ZodOptional<z.ZodArray<z.ZodObject<{
                houseid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
                name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                paid: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }, {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }>, "many">>;
            last_login: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            married_to: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            residence: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            sex: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            unlocked_titles: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        }, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        }>>>;
        deaths: z.ZodOptional<z.ZodArray<z.ZodObject<{
            assists: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                player: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                summon: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }, {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }>, "many">>;
            killers: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                player: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                summon: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }, {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }>, "many">>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            reason: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            time: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }, {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }>, "many">>;
        deaths_truncated: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        other_characters: z.ZodOptional<z.ZodArray<z.ZodObject<{
            deleted: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            main: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            position: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            traded: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        character?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        } | null | undefined;
        account_badges?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }[] | undefined;
        account_information?: {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        } | null | undefined;
        achievements?: {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }[] | undefined;
        deaths?: {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }[] | undefined;
        deaths_truncated?: boolean | null | undefined;
        other_characters?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }[] | undefined;
    }, {
        character?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        } | null | undefined;
        account_badges?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }[] | undefined;
        account_information?: {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        } | null | undefined;
        achievements?: {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }[] | undefined;
        deaths?: {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }[] | undefined;
        deaths_truncated?: boolean | null | undefined;
        other_characters?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    character: {
        character?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        } | null | undefined;
        account_badges?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }[] | undefined;
        account_information?: {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        } | null | undefined;
        achievements?: {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }[] | undefined;
        deaths?: {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }[] | undefined;
        deaths_truncated?: boolean | null | undefined;
        other_characters?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    character: {
        character?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            sex?: string | null | undefined;
            world?: string | null | undefined;
            guild?: {
                name?: string | null | undefined;
                rank?: string | null | undefined;
            } | null | undefined;
            houses?: {
                name?: string | null | undefined;
                houseid?: number | null | undefined;
                paid?: string | null | undefined;
                town?: string | null | undefined;
            }[] | undefined;
            position?: string | null | undefined;
            account_status?: string | null | undefined;
            achievement_points?: number | null | undefined;
            comment?: string | null | undefined;
            deletion_date?: string | null | undefined;
            former_names?: string[] | undefined;
            former_worlds?: string[] | undefined;
            last_login?: string | null | undefined;
            married_to?: string | null | undefined;
            residence?: string | null | undefined;
            title?: string | null | undefined;
            traded?: boolean | null | undefined;
            unlocked_titles?: number | null | undefined;
        } | null | undefined;
        account_badges?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            icon_url?: string | null | undefined;
        }[] | undefined;
        account_information?: {
            created?: string | null | undefined;
            loyalty_title?: string | null | undefined;
            position?: string | null | undefined;
        } | null | undefined;
        achievements?: {
            name?: string | null | undefined;
            grade?: number | null | undefined;
            secret?: boolean | null | undefined;
        }[] | undefined;
        deaths?: {
            level?: number | null | undefined;
            assists?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            killers?: {
                name?: string | null | undefined;
                traded?: boolean | null | undefined;
                player?: boolean | null | undefined;
                summon?: string | null | undefined;
            }[] | undefined;
            reason?: string | null | undefined;
            time?: string | null | undefined;
        }[] | undefined;
        deaths_truncated?: boolean | null | undefined;
        other_characters?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            world?: string | null | undefined;
            position?: string | null | undefined;
            traded?: boolean | null | undefined;
            deleted?: boolean | null | undefined;
            main?: boolean | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type CharacterResponse = z.infer<typeof CharacterResponseSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharacterInfo = z.infer<typeof CharacterInfoSchema>;
declare const OverviewWorldSchema: z.ZodObject<{
    battleye_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    battleye_protected: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    game_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    location: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    pvp_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    tournament_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    transfer_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    status?: string | null | undefined;
    players_online?: number | null | undefined;
    battleye_date?: string | null | undefined;
    battleye_protected?: boolean | null | undefined;
    game_world_type?: string | null | undefined;
    location?: string | null | undefined;
    premium_only?: boolean | null | undefined;
    pvp_type?: string | null | undefined;
    tournament_world_type?: string | null | undefined;
    transfer_type?: string | null | undefined;
}, {
    name?: string | null | undefined;
    status?: string | null | undefined;
    players_online?: number | null | undefined;
    battleye_date?: string | null | undefined;
    battleye_protected?: boolean | null | undefined;
    game_world_type?: string | null | undefined;
    location?: string | null | undefined;
    premium_only?: boolean | null | undefined;
    pvp_type?: string | null | undefined;
    tournament_world_type?: string | null | undefined;
    transfer_type?: string | null | undefined;
}>;
export declare const WorldsOverviewResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    worlds: z.ZodNullable<z.ZodObject<{
        players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        record_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        record_players: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        regular_worlds: z.ZodOptional<z.ZodArray<z.ZodObject<{
            battleye_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            battleye_protected: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            game_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            location: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            pvp_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            tournament_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            transfer_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }>, "many">>;
        tournament_worlds: z.ZodOptional<z.ZodArray<z.ZodObject<{
            battleye_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            battleye_protected: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            game_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            location: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            pvp_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            tournament_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            transfer_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        regular_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
        tournament_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
    }, {
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        regular_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
        tournament_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    worlds: {
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        regular_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
        tournament_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    worlds: {
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        regular_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
        tournament_worlds?: {
            name?: string | null | undefined;
            status?: string | null | undefined;
            players_online?: number | null | undefined;
            battleye_date?: string | null | undefined;
            battleye_protected?: boolean | null | undefined;
            game_world_type?: string | null | undefined;
            location?: string | null | undefined;
            premium_only?: boolean | null | undefined;
            pvp_type?: string | null | undefined;
            tournament_world_type?: string | null | undefined;
            transfer_type?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type WorldsOverviewResponse = z.infer<typeof WorldsOverviewResponseSchema>;
export type OverviewWorld = z.infer<typeof OverviewWorldSchema>;
declare const WorldSchema: z.ZodObject<{
    battleye_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    battleye_protected: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    creation_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    game_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    location: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    online_players: z.ZodOptional<z.ZodArray<z.ZodObject<{
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
    }>, "many">>;
    players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    pvp_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    record_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    record_players: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    tournament_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    transfer_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    world_quest_titles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    status?: string | null | undefined;
    players_online?: number | null | undefined;
    record_date?: string | null | undefined;
    record_players?: number | null | undefined;
    battleye_date?: string | null | undefined;
    battleye_protected?: boolean | null | undefined;
    game_world_type?: string | null | undefined;
    location?: string | null | undefined;
    premium_only?: boolean | null | undefined;
    pvp_type?: string | null | undefined;
    tournament_world_type?: string | null | undefined;
    transfer_type?: string | null | undefined;
    creation_date?: string | null | undefined;
    online_players?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
    }[] | undefined;
    world_quest_titles?: string[] | undefined;
}, {
    name?: string | null | undefined;
    status?: string | null | undefined;
    players_online?: number | null | undefined;
    record_date?: string | null | undefined;
    record_players?: number | null | undefined;
    battleye_date?: string | null | undefined;
    battleye_protected?: boolean | null | undefined;
    game_world_type?: string | null | undefined;
    location?: string | null | undefined;
    premium_only?: boolean | null | undefined;
    pvp_type?: string | null | undefined;
    tournament_world_type?: string | null | undefined;
    transfer_type?: string | null | undefined;
    creation_date?: string | null | undefined;
    online_players?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
    }[] | undefined;
    world_quest_titles?: string[] | undefined;
}>;
export declare const WorldResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    world: z.ZodNullable<z.ZodObject<{
        battleye_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        battleye_protected: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        creation_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        game_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        location: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        online_players: z.ZodOptional<z.ZodArray<z.ZodObject<{
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }>, "many">>;
        players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        pvp_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        record_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        record_players: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        tournament_world_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        transfer_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world_quest_titles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        status?: string | null | undefined;
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        battleye_date?: string | null | undefined;
        battleye_protected?: boolean | null | undefined;
        game_world_type?: string | null | undefined;
        location?: string | null | undefined;
        premium_only?: boolean | null | undefined;
        pvp_type?: string | null | undefined;
        tournament_world_type?: string | null | undefined;
        transfer_type?: string | null | undefined;
        creation_date?: string | null | undefined;
        online_players?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }[] | undefined;
        world_quest_titles?: string[] | undefined;
    }, {
        name?: string | null | undefined;
        status?: string | null | undefined;
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        battleye_date?: string | null | undefined;
        battleye_protected?: boolean | null | undefined;
        game_world_type?: string | null | undefined;
        location?: string | null | undefined;
        premium_only?: boolean | null | undefined;
        pvp_type?: string | null | undefined;
        tournament_world_type?: string | null | undefined;
        transfer_type?: string | null | undefined;
        creation_date?: string | null | undefined;
        online_players?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }[] | undefined;
        world_quest_titles?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    world: {
        name?: string | null | undefined;
        status?: string | null | undefined;
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        battleye_date?: string | null | undefined;
        battleye_protected?: boolean | null | undefined;
        game_world_type?: string | null | undefined;
        location?: string | null | undefined;
        premium_only?: boolean | null | undefined;
        pvp_type?: string | null | undefined;
        tournament_world_type?: string | null | undefined;
        transfer_type?: string | null | undefined;
        creation_date?: string | null | undefined;
        online_players?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }[] | undefined;
        world_quest_titles?: string[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    world: {
        name?: string | null | undefined;
        status?: string | null | undefined;
        players_online?: number | null | undefined;
        record_date?: string | null | undefined;
        record_players?: number | null | undefined;
        battleye_date?: string | null | undefined;
        battleye_protected?: boolean | null | undefined;
        game_world_type?: string | null | undefined;
        location?: string | null | undefined;
        premium_only?: boolean | null | undefined;
        pvp_type?: string | null | undefined;
        tournament_world_type?: string | null | undefined;
        transfer_type?: string | null | undefined;
        creation_date?: string | null | undefined;
        online_players?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
        }[] | undefined;
        world_quest_titles?: string[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type WorldResponse = z.infer<typeof WorldResponseSchema>;
export type World = z.infer<typeof WorldSchema>;
declare const OverviewBoostableBossSchema: z.ZodObject<{
    featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
}, {
    name?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
}>;
export declare const BoostableBossesOverviewResponseSchema: z.ZodObject<{
    boostable_bosses: z.ZodNullable<z.ZodObject<{
        boostable_boss_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }>, "many">>;
        boosted: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        boostable_boss_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }[] | undefined;
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        } | null | undefined;
    }, {
        boostable_boss_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }[] | undefined;
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        } | null | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    boostable_bosses: {
        boostable_boss_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }[] | undefined;
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    boostable_bosses: {
        boostable_boss_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        }[] | undefined;
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type BoostableBossesOverviewResponse = z.infer<typeof BoostableBossesOverviewResponseSchema>;
export type OverviewBoostableBoss = z.infer<typeof OverviewBoostableBossSchema>;
declare const OverviewCreatureSchema: z.ZodObject<{
    featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
    race?: string | null | undefined;
}, {
    name?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
    race?: string | null | undefined;
}>;
export declare const CreaturesOverviewResponseSchema: z.ZodObject<{
    creatures: z.ZodNullable<z.ZodObject<{
        boosted: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }>>>;
        creature_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        } | null | undefined;
        creature_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }[] | undefined;
    }, {
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        } | null | undefined;
        creature_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    creatures: {
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        } | null | undefined;
        creature_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    creatures: {
        boosted?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        } | null | undefined;
        creature_list?: {
            name?: string | null | undefined;
            featured?: boolean | null | undefined;
            image_url?: string | null | undefined;
            race?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type CreaturesOverviewResponse = z.infer<typeof CreaturesOverviewResponseSchema>;
export type OverviewCreature = z.infer<typeof OverviewCreatureSchema>;
declare const CreatureSchema: z.ZodObject<{
    be_convinced: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    be_paralysed: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    be_summoned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    behaviour: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    convinced_mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    experience_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    healed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    hitpoints: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    immune: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    is_lootable: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    loot_list: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    see_invisible: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    strong: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    summoned_mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    weakness: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
    race?: string | null | undefined;
    be_convinced?: boolean | null | undefined;
    be_paralysed?: boolean | null | undefined;
    be_summoned?: boolean | null | undefined;
    behaviour?: string | null | undefined;
    convinced_mana?: number | null | undefined;
    experience_points?: number | null | undefined;
    healed?: string[] | undefined;
    hitpoints?: number | null | undefined;
    immune?: string[] | undefined;
    is_lootable?: boolean | null | undefined;
    loot_list?: string[] | undefined;
    see_invisible?: boolean | null | undefined;
    strong?: string[] | undefined;
    summoned_mana?: number | null | undefined;
    weakness?: string[] | undefined;
}, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    featured?: boolean | null | undefined;
    image_url?: string | null | undefined;
    race?: string | null | undefined;
    be_convinced?: boolean | null | undefined;
    be_paralysed?: boolean | null | undefined;
    be_summoned?: boolean | null | undefined;
    behaviour?: string | null | undefined;
    convinced_mana?: number | null | undefined;
    experience_points?: number | null | undefined;
    healed?: string[] | undefined;
    hitpoints?: number | null | undefined;
    immune?: string[] | undefined;
    is_lootable?: boolean | null | undefined;
    loot_list?: string[] | undefined;
    see_invisible?: boolean | null | undefined;
    strong?: string[] | undefined;
    summoned_mana?: number | null | undefined;
    weakness?: string[] | undefined;
}>;
export declare const CreatureResponseSchema: z.ZodObject<{
    creature: z.ZodNullable<z.ZodObject<{
        be_convinced: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        be_paralysed: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        be_summoned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        behaviour: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        convinced_mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        experience_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        featured: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        healed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        hitpoints: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        immune: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        is_lootable: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        loot_list: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        see_invisible: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        strong: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        summoned_mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        weakness: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        featured?: boolean | null | undefined;
        image_url?: string | null | undefined;
        race?: string | null | undefined;
        be_convinced?: boolean | null | undefined;
        be_paralysed?: boolean | null | undefined;
        be_summoned?: boolean | null | undefined;
        behaviour?: string | null | undefined;
        convinced_mana?: number | null | undefined;
        experience_points?: number | null | undefined;
        healed?: string[] | undefined;
        hitpoints?: number | null | undefined;
        immune?: string[] | undefined;
        is_lootable?: boolean | null | undefined;
        loot_list?: string[] | undefined;
        see_invisible?: boolean | null | undefined;
        strong?: string[] | undefined;
        summoned_mana?: number | null | undefined;
        weakness?: string[] | undefined;
    }, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        featured?: boolean | null | undefined;
        image_url?: string | null | undefined;
        race?: string | null | undefined;
        be_convinced?: boolean | null | undefined;
        be_paralysed?: boolean | null | undefined;
        be_summoned?: boolean | null | undefined;
        behaviour?: string | null | undefined;
        convinced_mana?: number | null | undefined;
        experience_points?: number | null | undefined;
        healed?: string[] | undefined;
        hitpoints?: number | null | undefined;
        immune?: string[] | undefined;
        is_lootable?: boolean | null | undefined;
        loot_list?: string[] | undefined;
        see_invisible?: boolean | null | undefined;
        strong?: string[] | undefined;
        summoned_mana?: number | null | undefined;
        weakness?: string[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    creature: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        featured?: boolean | null | undefined;
        image_url?: string | null | undefined;
        race?: string | null | undefined;
        be_convinced?: boolean | null | undefined;
        be_paralysed?: boolean | null | undefined;
        be_summoned?: boolean | null | undefined;
        behaviour?: string | null | undefined;
        convinced_mana?: number | null | undefined;
        experience_points?: number | null | undefined;
        healed?: string[] | undefined;
        hitpoints?: number | null | undefined;
        immune?: string[] | undefined;
        is_lootable?: boolean | null | undefined;
        loot_list?: string[] | undefined;
        see_invisible?: boolean | null | undefined;
        strong?: string[] | undefined;
        summoned_mana?: number | null | undefined;
        weakness?: string[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    creature: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        featured?: boolean | null | undefined;
        image_url?: string | null | undefined;
        race?: string | null | undefined;
        be_convinced?: boolean | null | undefined;
        be_paralysed?: boolean | null | undefined;
        be_summoned?: boolean | null | undefined;
        behaviour?: string | null | undefined;
        convinced_mana?: number | null | undefined;
        experience_points?: number | null | undefined;
        healed?: string[] | undefined;
        hitpoints?: number | null | undefined;
        immune?: string[] | undefined;
        is_lootable?: boolean | null | undefined;
        loot_list?: string[] | undefined;
        see_invisible?: boolean | null | undefined;
        strong?: string[] | undefined;
        summoned_mana?: number | null | undefined;
        weakness?: string[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type CreatureResponse = z.infer<typeof CreatureResponseSchema>;
export type Creature = z.infer<typeof CreatureSchema>;
declare const SpellOverviewItemSchema: z.ZodObject<{
    formula: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    spell_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    type_instant: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    type_rune: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    premium_only?: boolean | null | undefined;
    formula?: string | null | undefined;
    group_attack?: boolean | null | undefined;
    group_healing?: boolean | null | undefined;
    group_support?: boolean | null | undefined;
    mana?: number | null | undefined;
    price?: number | null | undefined;
    spell_id?: string | null | undefined;
    type_instant?: boolean | null | undefined;
    type_rune?: boolean | null | undefined;
}, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    premium_only?: boolean | null | undefined;
    formula?: string | null | undefined;
    group_attack?: boolean | null | undefined;
    group_healing?: boolean | null | undefined;
    group_support?: boolean | null | undefined;
    mana?: number | null | undefined;
    price?: number | null | undefined;
    spell_id?: string | null | undefined;
    type_instant?: boolean | null | undefined;
    type_rune?: boolean | null | undefined;
}>;
export declare const SpellsOverviewResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    spells: z.ZodNullable<z.ZodObject<{
        spell_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            formula: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            spell_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            type_instant: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            type_rune: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }>, "many">>;
        spells_filter: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        spell_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }[] | undefined;
        spells_filter?: string | null | undefined;
    }, {
        spell_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }[] | undefined;
        spells_filter?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    spells: {
        spell_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }[] | undefined;
        spells_filter?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    spells: {
        spell_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            spell_id?: string | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
        }[] | undefined;
        spells_filter?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type SpellsOverviewResponse = z.infer<typeof SpellsOverviewResponseSchema>;
export type Spell = z.infer<typeof SpellOverviewItemSchema>;
declare const SpellDataSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    has_rune_information: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    has_spell_information: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    rune_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        damage_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        magic_level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        vocation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        magic_level?: number | null | undefined;
    }, {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        magic_level?: number | null | undefined;
    }>>>;
    spell_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    spell_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        city: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cooldown_alone: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        cooldown_group: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        damage_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        formula: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        soul_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        type_instant: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        type_rune: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        vocation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        premium_only?: boolean | null | undefined;
        formula?: string | null | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        mana?: number | null | undefined;
        price?: number | null | undefined;
        type_instant?: boolean | null | undefined;
        type_rune?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        amount?: number | null | undefined;
        city?: string[] | undefined;
        cooldown_alone?: number | null | undefined;
        cooldown_group?: number | null | undefined;
        soul_points?: number | null | undefined;
    }, {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        premium_only?: boolean | null | undefined;
        formula?: string | null | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        mana?: number | null | undefined;
        price?: number | null | undefined;
        type_instant?: boolean | null | undefined;
        type_rune?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        amount?: number | null | undefined;
        city?: string[] | undefined;
        cooldown_alone?: number | null | undefined;
        cooldown_group?: number | null | undefined;
        soul_points?: number | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    image_url?: string | null | undefined;
    spell_id?: string | null | undefined;
    has_rune_information?: boolean | null | undefined;
    has_spell_information?: boolean | null | undefined;
    rune_information?: {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        magic_level?: number | null | undefined;
    } | null | undefined;
    spell_information?: {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        premium_only?: boolean | null | undefined;
        formula?: string | null | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        mana?: number | null | undefined;
        price?: number | null | undefined;
        type_instant?: boolean | null | undefined;
        type_rune?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        amount?: number | null | undefined;
        city?: string[] | undefined;
        cooldown_alone?: number | null | undefined;
        cooldown_group?: number | null | undefined;
        soul_points?: number | null | undefined;
    } | null | undefined;
}, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    image_url?: string | null | undefined;
    spell_id?: string | null | undefined;
    has_rune_information?: boolean | null | undefined;
    has_spell_information?: boolean | null | undefined;
    rune_information?: {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        magic_level?: number | null | undefined;
    } | null | undefined;
    spell_information?: {
        level?: number | null | undefined;
        vocation?: string[] | undefined;
        premium_only?: boolean | null | undefined;
        formula?: string | null | undefined;
        group_attack?: boolean | null | undefined;
        group_healing?: boolean | null | undefined;
        group_support?: boolean | null | undefined;
        mana?: number | null | undefined;
        price?: number | null | undefined;
        type_instant?: boolean | null | undefined;
        type_rune?: boolean | null | undefined;
        damage_type?: string | null | undefined;
        amount?: number | null | undefined;
        city?: string[] | undefined;
        cooldown_alone?: number | null | undefined;
        cooldown_group?: number | null | undefined;
        soul_points?: number | null | undefined;
    } | null | undefined;
}>;
export declare const SpellInformationResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    spell: z.ZodNullable<z.ZodObject<{
        description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        has_rune_information: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        has_spell_information: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        image_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        rune_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            damage_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            magic_level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        }, {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        }>>>;
        spell_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        spell_information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            city: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            cooldown_alone: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            cooldown_group: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            damage_type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            formula: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            group_attack: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_healing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            group_support: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            mana: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            premium_only: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            soul_points: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            type_instant: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            type_rune: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        }, {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        image_url?: string | null | undefined;
        spell_id?: string | null | undefined;
        has_rune_information?: boolean | null | undefined;
        has_spell_information?: boolean | null | undefined;
        rune_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        } | null | undefined;
        spell_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        } | null | undefined;
    }, {
        name?: string | null | undefined;
        description?: string | null | undefined;
        image_url?: string | null | undefined;
        spell_id?: string | null | undefined;
        has_rune_information?: boolean | null | undefined;
        has_spell_information?: boolean | null | undefined;
        rune_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        } | null | undefined;
        spell_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        } | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    spell: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        image_url?: string | null | undefined;
        spell_id?: string | null | undefined;
        has_rune_information?: boolean | null | undefined;
        has_spell_information?: boolean | null | undefined;
        rune_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        } | null | undefined;
        spell_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    spell: {
        name?: string | null | undefined;
        description?: string | null | undefined;
        image_url?: string | null | undefined;
        spell_id?: string | null | undefined;
        has_rune_information?: boolean | null | undefined;
        has_spell_information?: boolean | null | undefined;
        rune_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            magic_level?: number | null | undefined;
        } | null | undefined;
        spell_information?: {
            level?: number | null | undefined;
            vocation?: string[] | undefined;
            premium_only?: boolean | null | undefined;
            formula?: string | null | undefined;
            group_attack?: boolean | null | undefined;
            group_healing?: boolean | null | undefined;
            group_support?: boolean | null | undefined;
            mana?: number | null | undefined;
            price?: number | null | undefined;
            type_instant?: boolean | null | undefined;
            type_rune?: boolean | null | undefined;
            damage_type?: string | null | undefined;
            amount?: number | null | undefined;
            city?: string[] | undefined;
            cooldown_alone?: number | null | undefined;
            cooldown_group?: number | null | undefined;
            soul_points?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type SpellInformationResponse = z.infer<typeof SpellInformationResponseSchema>;
export type SpellData = z.infer<typeof SpellDataSchema>;
export declare const HighscoreCategorySchema: z.ZodEnum<["achievements", "axefighting", "charmpoints", "clubfighting", "distancefighting", "experience", "fishing", "fistfighting", "goshnarstaint", "loyaltypoints", "magiclevel", "shielding", "swordfighting", "dromescore", "bosspoints", "bountypoints", "weeklytasks", "phosphorusrecord"]>;
export type HighscoreCategory = z.infer<typeof HighscoreCategorySchema>;
export declare const HighscoreVocationSchema: z.ZodEnum<["all", "knights", "paladins", "sorcerers", "druids", "monks"]>;
export type HighscoreVocation = z.infer<typeof HighscoreVocationSchema>;
declare const HighscoreEntrySchema: z.ZodObject<{
    level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    rank: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    vocation?: string | null | undefined;
    value?: number | null | undefined;
    world?: string | null | undefined;
    rank?: number | null | undefined;
    title?: string | null | undefined;
}, {
    name?: string | null | undefined;
    level?: number | null | undefined;
    vocation?: string | null | undefined;
    value?: number | null | undefined;
    world?: string | null | undefined;
    rank?: number | null | undefined;
    title?: string | null | undefined;
}>;
export declare const HighscoresResponseSchema: z.ZodObject<{
    highscores: z.ZodNullable<z.ZodObject<{
        category: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        highscore_age: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        highscore_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rank: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            value: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }>, "many">>;
        highscore_page: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            current_page: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            total_pages: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            total_records: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        }, {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        }>>>;
        vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        vocation?: string | null | undefined;
        category?: string | null | undefined;
        world?: string | null | undefined;
        highscore_age?: number | null | undefined;
        highscore_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }[] | undefined;
        highscore_page?: {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        } | null | undefined;
    }, {
        vocation?: string | null | undefined;
        category?: string | null | undefined;
        world?: string | null | undefined;
        highscore_age?: number | null | undefined;
        highscore_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }[] | undefined;
        highscore_page?: {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        } | null | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    highscores: {
        vocation?: string | null | undefined;
        category?: string | null | undefined;
        world?: string | null | undefined;
        highscore_age?: number | null | undefined;
        highscore_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }[] | undefined;
        highscore_page?: {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    highscores: {
        vocation?: string | null | undefined;
        category?: string | null | undefined;
        world?: string | null | undefined;
        highscore_age?: number | null | undefined;
        highscore_list?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            value?: number | null | undefined;
            world?: string | null | undefined;
            rank?: number | null | undefined;
            title?: string | null | undefined;
        }[] | undefined;
        highscore_page?: {
            current_page?: number | null | undefined;
            total_pages?: number | null | undefined;
            total_records?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type HighscoresResponse = z.infer<typeof HighscoresResponseSchema>;
export type Highscore = z.infer<typeof HighscoreEntrySchema>;
export declare const HousesOverviewResponseSchema: z.ZodObject<{
    houses: z.ZodNullable<z.ZodObject<{
        guildhall_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            auction: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                current_bid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
                finished: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                time_left: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            }, {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            }>>>;
            auctioned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            house_id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            rented: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            size: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }, {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }>, "many">>;
        house_list: z.ZodOptional<z.ZodArray<z.ZodObject<{
            auction: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                current_bid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
                finished: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                time_left: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            }, {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            }>>>;
            auctioned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            house_id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            rented: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            size: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }, {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }>, "many">>;
        town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        world?: string | null | undefined;
        town?: string | null | undefined;
        guildhall_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
        house_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
    }, {
        world?: string | null | undefined;
        town?: string | null | undefined;
        guildhall_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
        house_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    houses: {
        world?: string | null | undefined;
        town?: string | null | undefined;
        guildhall_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
        house_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    houses: {
        world?: string | null | undefined;
        town?: string | null | undefined;
        guildhall_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
        house_list?: {
            name?: string | null | undefined;
            auction?: {
                finished?: boolean | null | undefined;
                current_bid?: number | null | undefined;
                time_left?: string | null | undefined;
            } | null | undefined;
            auctioned?: boolean | null | undefined;
            house_id?: number | null | undefined;
            rent?: number | null | undefined;
            rented?: boolean | null | undefined;
            size?: number | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type HousesOverviewResponse = z.infer<typeof HousesOverviewResponseSchema>;
declare const HouseSchema: z.ZodObject<{
    beds: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    houseid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    img: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    rent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    size: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        auction: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            auction_end: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            auction_ongoing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            current_bid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            current_bidder: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        }, {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        }>>>;
        is_auctioned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        is_moving: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        is_rented: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        is_transfering: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        original: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        rental: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            moving_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            owner: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            owner_sex: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            paid_until: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            transfer_accept: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            transfer_price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            transfer_receiver: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        }, {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        auction?: {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        } | null | undefined;
        is_auctioned?: boolean | null | undefined;
        is_moving?: boolean | null | undefined;
        is_rented?: boolean | null | undefined;
        is_transfering?: boolean | null | undefined;
        original?: string | null | undefined;
        rental?: {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        } | null | undefined;
    }, {
        auction?: {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        } | null | undefined;
        is_auctioned?: boolean | null | undefined;
        is_moving?: boolean | null | undefined;
        is_rented?: boolean | null | undefined;
        is_transfering?: boolean | null | undefined;
        original?: string | null | undefined;
        rental?: {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        } | null | undefined;
    }>>>;
    town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    status?: {
        auction?: {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        } | null | undefined;
        is_auctioned?: boolean | null | undefined;
        is_moving?: boolean | null | undefined;
        is_rented?: boolean | null | undefined;
        is_transfering?: boolean | null | undefined;
        original?: string | null | undefined;
        rental?: {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        } | null | undefined;
    } | null | undefined;
    type?: string | null | undefined;
    world?: string | null | undefined;
    houseid?: number | null | undefined;
    town?: string | null | undefined;
    rent?: number | null | undefined;
    size?: number | null | undefined;
    beds?: number | null | undefined;
    img?: string | null | undefined;
}, {
    name?: string | null | undefined;
    status?: {
        auction?: {
            current_bid?: number | null | undefined;
            auction_end?: string | null | undefined;
            auction_ongoing?: boolean | null | undefined;
            current_bidder?: string | null | undefined;
        } | null | undefined;
        is_auctioned?: boolean | null | undefined;
        is_moving?: boolean | null | undefined;
        is_rented?: boolean | null | undefined;
        is_transfering?: boolean | null | undefined;
        original?: string | null | undefined;
        rental?: {
            moving_date?: string | null | undefined;
            owner?: string | null | undefined;
            owner_sex?: string | null | undefined;
            paid_until?: string | null | undefined;
            transfer_accept?: boolean | null | undefined;
            transfer_price?: number | null | undefined;
            transfer_receiver?: string | null | undefined;
        } | null | undefined;
    } | null | undefined;
    type?: string | null | undefined;
    world?: string | null | undefined;
    houseid?: number | null | undefined;
    town?: string | null | undefined;
    rent?: number | null | undefined;
    size?: number | null | undefined;
    beds?: number | null | undefined;
    img?: string | null | undefined;
}>;
export declare const HouseResponseSchema: z.ZodObject<{
    house: z.ZodNullable<z.ZodObject<{
        beds: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        houseid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        img: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        rent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        size: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            auction: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                auction_end: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                auction_ongoing: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                current_bid: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
                current_bidder: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            }, {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            }>>>;
            is_auctioned: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            is_moving: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            is_rented: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            is_transfering: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            original: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rental: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                moving_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                owner: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                owner_sex: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                paid_until: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
                transfer_accept: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                transfer_price: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
                transfer_receiver: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            }, {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            }>>>;
        }, "strip", z.ZodTypeAny, {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        }, {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        }>>>;
        town: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        status?: {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        } | null | undefined;
        type?: string | null | undefined;
        world?: string | null | undefined;
        houseid?: number | null | undefined;
        town?: string | null | undefined;
        rent?: number | null | undefined;
        size?: number | null | undefined;
        beds?: number | null | undefined;
        img?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        status?: {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        } | null | undefined;
        type?: string | null | undefined;
        world?: string | null | undefined;
        houseid?: number | null | undefined;
        town?: string | null | undefined;
        rent?: number | null | undefined;
        size?: number | null | undefined;
        beds?: number | null | undefined;
        img?: string | null | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    house: {
        name?: string | null | undefined;
        status?: {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        } | null | undefined;
        type?: string | null | undefined;
        world?: string | null | undefined;
        houseid?: number | null | undefined;
        town?: string | null | undefined;
        rent?: number | null | undefined;
        size?: number | null | undefined;
        beds?: number | null | undefined;
        img?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    house: {
        name?: string | null | undefined;
        status?: {
            auction?: {
                current_bid?: number | null | undefined;
                auction_end?: string | null | undefined;
                auction_ongoing?: boolean | null | undefined;
                current_bidder?: string | null | undefined;
            } | null | undefined;
            is_auctioned?: boolean | null | undefined;
            is_moving?: boolean | null | undefined;
            is_rented?: boolean | null | undefined;
            is_transfering?: boolean | null | undefined;
            original?: string | null | undefined;
            rental?: {
                moving_date?: string | null | undefined;
                owner?: string | null | undefined;
                owner_sex?: string | null | undefined;
                paid_until?: string | null | undefined;
                transfer_accept?: boolean | null | undefined;
                transfer_price?: number | null | undefined;
                transfer_receiver?: string | null | undefined;
            } | null | undefined;
        } | null | undefined;
        type?: string | null | undefined;
        world?: string | null | undefined;
        houseid?: number | null | undefined;
        town?: string | null | undefined;
        rent?: number | null | undefined;
        size?: number | null | undefined;
        beds?: number | null | undefined;
        img?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type HouseResponse = z.infer<typeof HouseResponseSchema>;
export type House = z.infer<typeof HouseSchema>;
export declare const KillStatisticsResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    killstatistics: z.ZodNullable<z.ZodObject<{
        entries: z.ZodOptional<z.ZodArray<z.ZodObject<{
            last_day_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_day_players_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_week_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_week_players_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            race: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }, {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }>, "many">>;
        total: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            last_day_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_day_players_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_week_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            last_week_players_killed: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }, {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }>>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        entries?: {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        total?: {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        } | null | undefined;
    }, {
        entries?: {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        total?: {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        } | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    killstatistics: {
        entries?: {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        total?: {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    killstatistics: {
        entries?: {
            race?: string | null | undefined;
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        total?: {
            last_day_killed?: number | null | undefined;
            last_day_players_killed?: number | null | undefined;
            last_week_killed?: number | null | undefined;
            last_week_players_killed?: number | null | undefined;
        } | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type KillStatisticsResponse = z.infer<typeof KillStatisticsResponseSchema>;
declare const NewsItemSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    news: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    url_api: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    id?: number | null | undefined;
    type?: string | null | undefined;
    date?: string | null | undefined;
    category?: string | null | undefined;
    news?: string | null | undefined;
    url?: string | null | undefined;
    url_api?: string | null | undefined;
}, {
    id?: number | null | undefined;
    type?: string | null | undefined;
    date?: string | null | undefined;
    category?: string | null | undefined;
    news?: string | null | undefined;
    url?: string | null | undefined;
    url_api?: string | null | undefined;
}>;
export declare const NewsListResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    news: z.ZodArray<z.ZodObject<{
        category: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        news: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        url_api: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        news?: string | null | undefined;
        url?: string | null | undefined;
        url_api?: string | null | undefined;
    }, {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        news?: string | null | undefined;
        url?: string | null | undefined;
        url_api?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    news: {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        news?: string | null | undefined;
        url?: string | null | undefined;
        url_api?: string | null | undefined;
    }[];
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    news: {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        news?: string | null | undefined;
        url?: string | null | undefined;
        url_api?: string | null | undefined;
    }[];
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type NewsListResponse = z.infer<typeof NewsListResponseSchema>;
export type NewsItem = z.infer<typeof NewsItemSchema>;
declare const NewsDetailSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    content: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    content_html: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    id?: number | null | undefined;
    type?: string | null | undefined;
    date?: string | null | undefined;
    category?: string | null | undefined;
    title?: string | null | undefined;
    url?: string | null | undefined;
    content?: string | null | undefined;
    content_html?: string | null | undefined;
}, {
    id?: number | null | undefined;
    type?: string | null | undefined;
    date?: string | null | undefined;
    category?: string | null | undefined;
    title?: string | null | undefined;
    url?: string | null | undefined;
    content?: string | null | undefined;
    content_html?: string | null | undefined;
}>;
export declare const NewsResponseSchema: z.ZodObject<{
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
    news: z.ZodNullable<z.ZodObject<{
        category: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        content: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        content_html: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        type: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        title?: string | null | undefined;
        url?: string | null | undefined;
        content?: string | null | undefined;
        content_html?: string | null | undefined;
    }, {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        title?: string | null | undefined;
        url?: string | null | undefined;
        content?: string | null | undefined;
        content_html?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    news: {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        title?: string | null | undefined;
        url?: string | null | undefined;
        content?: string | null | undefined;
        content_html?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    news: {
        id?: number | null | undefined;
        type?: string | null | undefined;
        date?: string | null | undefined;
        category?: string | null | undefined;
        title?: string | null | undefined;
        url?: string | null | undefined;
        content?: string | null | undefined;
        content_html?: string | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type NewsResponse = z.infer<typeof NewsResponseSchema>;
export type News = z.infer<typeof NewsDetailSchema>;
declare const GuildSchema: z.ZodObject<{
    active: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    disband_condition: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    disband_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    founded: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    guildhalls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        paid_until: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        world?: string | null | undefined;
        paid_until?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        world?: string | null | undefined;
        paid_until?: string | null | undefined;
    }>, "many">>;
    homepage: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    in_war: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    invites: z.ZodOptional<z.ZodArray<z.ZodObject<{
        date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        date?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        date?: string | null | undefined;
    }>, "many">>;
    logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    members: z.ZodOptional<z.ZodArray<z.ZodObject<{
        joined: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        rank: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        status?: string | null | undefined;
        rank?: string | null | undefined;
        title?: string | null | undefined;
        joined?: string | null | undefined;
    }, {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        status?: string | null | undefined;
        rank?: string | null | undefined;
        title?: string | null | undefined;
        joined?: string | null | undefined;
    }>, "many">>;
    members_invited: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    members_total: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    open_applications: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    players_offline: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
    world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    active?: boolean | null | undefined;
    members?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        status?: string | null | undefined;
        rank?: string | null | undefined;
        title?: string | null | undefined;
        joined?: string | null | undefined;
    }[] | undefined;
    world?: string | null | undefined;
    description?: string | null | undefined;
    players_online?: number | null | undefined;
    disband_condition?: string | null | undefined;
    disband_date?: string | null | undefined;
    founded?: string | null | undefined;
    guildhalls?: {
        name?: string | null | undefined;
        world?: string | null | undefined;
        paid_until?: string | null | undefined;
    }[] | undefined;
    homepage?: string | null | undefined;
    in_war?: boolean | null | undefined;
    invites?: {
        name?: string | null | undefined;
        date?: string | null | undefined;
    }[] | undefined;
    logo_url?: string | null | undefined;
    members_invited?: number | null | undefined;
    members_total?: number | null | undefined;
    open_applications?: boolean | null | undefined;
    players_offline?: number | null | undefined;
}, {
    name?: string | null | undefined;
    active?: boolean | null | undefined;
    members?: {
        name?: string | null | undefined;
        level?: number | null | undefined;
        vocation?: string | null | undefined;
        status?: string | null | undefined;
        rank?: string | null | undefined;
        title?: string | null | undefined;
        joined?: string | null | undefined;
    }[] | undefined;
    world?: string | null | undefined;
    description?: string | null | undefined;
    players_online?: number | null | undefined;
    disband_condition?: string | null | undefined;
    disband_date?: string | null | undefined;
    founded?: string | null | undefined;
    guildhalls?: {
        name?: string | null | undefined;
        world?: string | null | undefined;
        paid_until?: string | null | undefined;
    }[] | undefined;
    homepage?: string | null | undefined;
    in_war?: boolean | null | undefined;
    invites?: {
        name?: string | null | undefined;
        date?: string | null | undefined;
    }[] | undefined;
    logo_url?: string | null | undefined;
    members_invited?: number | null | undefined;
    members_total?: number | null | undefined;
    open_applications?: boolean | null | undefined;
    players_offline?: number | null | undefined;
}>;
export declare const GuildResponseSchema: z.ZodObject<{
    guild: z.ZodNullable<z.ZodObject<{
        active: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        disband_condition: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        disband_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        founded: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        guildhalls: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            paid_until: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }>, "many">>;
        homepage: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        in_war: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        invites: z.ZodOptional<z.ZodArray<z.ZodObject<{
            date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }>, "many">>;
        logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        members: z.ZodOptional<z.ZodArray<z.ZodObject<{
            joined: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            level: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            rank: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            status: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            title: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            vocation: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }>, "many">>;
        members_invited: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        members_total: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        open_applications: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        players_offline: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        players_online: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        name?: string | null | undefined;
        active?: boolean | null | undefined;
        members?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        description?: string | null | undefined;
        players_online?: number | null | undefined;
        disband_condition?: string | null | undefined;
        disband_date?: string | null | undefined;
        founded?: string | null | undefined;
        guildhalls?: {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }[] | undefined;
        homepage?: string | null | undefined;
        in_war?: boolean | null | undefined;
        invites?: {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }[] | undefined;
        logo_url?: string | null | undefined;
        members_invited?: number | null | undefined;
        members_total?: number | null | undefined;
        open_applications?: boolean | null | undefined;
        players_offline?: number | null | undefined;
    }, {
        name?: string | null | undefined;
        active?: boolean | null | undefined;
        members?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        description?: string | null | undefined;
        players_online?: number | null | undefined;
        disband_condition?: string | null | undefined;
        disband_date?: string | null | undefined;
        founded?: string | null | undefined;
        guildhalls?: {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }[] | undefined;
        homepage?: string | null | undefined;
        in_war?: boolean | null | undefined;
        invites?: {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }[] | undefined;
        logo_url?: string | null | undefined;
        members_invited?: number | null | undefined;
        members_total?: number | null | undefined;
        open_applications?: boolean | null | undefined;
        players_offline?: number | null | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    guild: {
        name?: string | null | undefined;
        active?: boolean | null | undefined;
        members?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        description?: string | null | undefined;
        players_online?: number | null | undefined;
        disband_condition?: string | null | undefined;
        disband_date?: string | null | undefined;
        founded?: string | null | undefined;
        guildhalls?: {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }[] | undefined;
        homepage?: string | null | undefined;
        in_war?: boolean | null | undefined;
        invites?: {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }[] | undefined;
        logo_url?: string | null | undefined;
        members_invited?: number | null | undefined;
        members_total?: number | null | undefined;
        open_applications?: boolean | null | undefined;
        players_offline?: number | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    guild: {
        name?: string | null | undefined;
        active?: boolean | null | undefined;
        members?: {
            name?: string | null | undefined;
            level?: number | null | undefined;
            vocation?: string | null | undefined;
            status?: string | null | undefined;
            rank?: string | null | undefined;
            title?: string | null | undefined;
            joined?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        description?: string | null | undefined;
        players_online?: number | null | undefined;
        disband_condition?: string | null | undefined;
        disband_date?: string | null | undefined;
        founded?: string | null | undefined;
        guildhalls?: {
            name?: string | null | undefined;
            world?: string | null | undefined;
            paid_until?: string | null | undefined;
        }[] | undefined;
        homepage?: string | null | undefined;
        in_war?: boolean | null | undefined;
        invites?: {
            name?: string | null | undefined;
            date?: string | null | undefined;
        }[] | undefined;
        logo_url?: string | null | undefined;
        members_invited?: number | null | undefined;
        members_total?: number | null | undefined;
        open_applications?: boolean | null | undefined;
        players_offline?: number | null | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type GuildResponse = z.infer<typeof GuildResponseSchema>;
export type Guild = z.infer<typeof GuildSchema>;
declare const OverviewGuildSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    logo_url?: string | null | undefined;
}, {
    name?: string | null | undefined;
    description?: string | null | undefined;
    logo_url?: string | null | undefined;
}>;
export type OverviewGuild = z.infer<typeof OverviewGuildSchema>;
export declare const GuildsOverviewResponseSchema: z.ZodObject<{
    guilds: z.ZodNullable<z.ZodObject<{
        active: z.ZodOptional<z.ZodArray<z.ZodObject<{
            description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }>, "many">>;
        formation: z.ZodOptional<z.ZodArray<z.ZodObject<{
            description: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }, {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }>, "many">>;
        world: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        active?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        formation?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
    }, {
        active?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        formation?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    guilds: {
        active?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        formation?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    guilds: {
        active?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
        world?: string | null | undefined;
        formation?: {
            name?: string | null | undefined;
            description?: string | null | undefined;
            logo_url?: string | null | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type GuildsOverviewResponse = z.infer<typeof GuildsOverviewResponseSchema>;
declare const FansiteSchema: z.ZodObject<{
    contact: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    content_type: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        statistics: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        texts: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        tools: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        wiki: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        statistics?: boolean | null | undefined;
        texts?: boolean | null | undefined;
        tools?: boolean | null | undefined;
        wiki?: boolean | null | undefined;
    }, {
        statistics?: boolean | null | undefined;
        texts?: boolean | null | undefined;
        tools?: boolean | null | undefined;
        wiki?: boolean | null | undefined;
    }>>>;
    fansite_item: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    fansite_item_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    homepage: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    social_media: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        discord: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        facebook: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        instagram: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        reddit: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        twitch: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        twitter: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
        youtube: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        discord?: boolean | null | undefined;
        facebook?: boolean | null | undefined;
        instagram?: boolean | null | undefined;
        reddit?: boolean | null | undefined;
        twitch?: boolean | null | undefined;
        twitter?: boolean | null | undefined;
        youtube?: boolean | null | undefined;
    }, {
        discord?: boolean | null | undefined;
        facebook?: boolean | null | undefined;
        instagram?: boolean | null | undefined;
        reddit?: boolean | null | undefined;
        twitch?: boolean | null | undefined;
        twitter?: boolean | null | undefined;
        youtube?: boolean | null | undefined;
    }>>>;
    specials: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name?: string | null | undefined;
    homepage?: string | null | undefined;
    logo_url?: string | null | undefined;
    contact?: string | null | undefined;
    content_type?: {
        statistics?: boolean | null | undefined;
        texts?: boolean | null | undefined;
        tools?: boolean | null | undefined;
        wiki?: boolean | null | undefined;
    } | null | undefined;
    fansite_item?: boolean | null | undefined;
    fansite_item_url?: string | null | undefined;
    languages?: string[] | undefined;
    social_media?: {
        discord?: boolean | null | undefined;
        facebook?: boolean | null | undefined;
        instagram?: boolean | null | undefined;
        reddit?: boolean | null | undefined;
        twitch?: boolean | null | undefined;
        twitter?: boolean | null | undefined;
        youtube?: boolean | null | undefined;
    } | null | undefined;
    specials?: string[] | undefined;
}, {
    name?: string | null | undefined;
    homepage?: string | null | undefined;
    logo_url?: string | null | undefined;
    contact?: string | null | undefined;
    content_type?: {
        statistics?: boolean | null | undefined;
        texts?: boolean | null | undefined;
        tools?: boolean | null | undefined;
        wiki?: boolean | null | undefined;
    } | null | undefined;
    fansite_item?: boolean | null | undefined;
    fansite_item_url?: string | null | undefined;
    languages?: string[] | undefined;
    social_media?: {
        discord?: boolean | null | undefined;
        facebook?: boolean | null | undefined;
        instagram?: boolean | null | undefined;
        reddit?: boolean | null | undefined;
        twitch?: boolean | null | undefined;
        twitter?: boolean | null | undefined;
        youtube?: boolean | null | undefined;
    } | null | undefined;
    specials?: string[] | undefined;
}>;
export declare const FansitesResponseSchema: z.ZodObject<{
    fansites: z.ZodNullable<z.ZodObject<{
        promoted: z.ZodOptional<z.ZodArray<z.ZodObject<{
            contact: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            content_type: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                statistics: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                texts: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                tools: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                wiki: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            }, {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            }>>>;
            fansite_item: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            fansite_item_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            homepage: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            social_media: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                discord: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                facebook: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                instagram: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                reddit: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                twitch: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                twitter: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                youtube: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            }, {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            }>>>;
            specials: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }, {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }>, "many">>;
        supported: z.ZodOptional<z.ZodArray<z.ZodObject<{
            contact: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            content_type: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                statistics: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                texts: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                tools: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                wiki: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            }, {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            }>>>;
            fansite_item: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            fansite_item_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            homepage: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            logo_url: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            name: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            social_media: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                discord: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                facebook: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                instagram: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                reddit: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                twitch: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                twitter: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
                youtube: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNull]>>;
            }, "strip", z.ZodTypeAny, {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            }, {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            }>>>;
            specials: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }, {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        promoted?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
        supported?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
    }, {
        promoted?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
        supported?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
    }>>;
    information: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        api: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            commit: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            release: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
            version: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }, {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        }>>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            error: z.ZodNumber;
            http_code: z.ZodNumber;
            message: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }, {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        }>>>;
        tibia_urls: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timestamp: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    }, "strip", z.ZodTypeAny, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }, {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    fansites: {
        promoted?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
        supported?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}, {
    fansites: {
        promoted?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
        supported?: {
            name?: string | null | undefined;
            homepage?: string | null | undefined;
            logo_url?: string | null | undefined;
            contact?: string | null | undefined;
            content_type?: {
                statistics?: boolean | null | undefined;
                texts?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                wiki?: boolean | null | undefined;
            } | null | undefined;
            fansite_item?: boolean | null | undefined;
            fansite_item_url?: string | null | undefined;
            languages?: string[] | undefined;
            social_media?: {
                discord?: boolean | null | undefined;
                facebook?: boolean | null | undefined;
                instagram?: boolean | null | undefined;
                reddit?: boolean | null | undefined;
                twitch?: boolean | null | undefined;
                twitter?: boolean | null | undefined;
                youtube?: boolean | null | undefined;
            } | null | undefined;
            specials?: string[] | undefined;
        }[] | undefined;
    } | null;
    information?: {
        status?: {
            error: number;
            http_code: number;
            message?: string | null | undefined;
        } | null | undefined;
        api?: {
            commit?: string | null | undefined;
            release?: string | null | undefined;
            version?: number | null | undefined;
        } | null | undefined;
        tibia_urls?: string[] | undefined;
        timestamp?: string | null | undefined;
    } | null | undefined;
}>;
export type FansitesResponse = z.infer<typeof FansitesResponseSchema>;
export type Fansite = z.infer<typeof FansiteSchema>;
export {};
//# sourceMappingURL=types.d.ts.map