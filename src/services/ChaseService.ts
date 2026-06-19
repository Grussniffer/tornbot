import { Chased, Locations, WarMember} from "../types";

const faction_id: string =
    process.env.FACTION ||
    process.env.ALLIED_FACTION_ID ||
    process.env.ALLIED_FACTION ||
    "41309";

export class ChaseService {

    static getAllies(activity: WarMember[]) {
        return activity.filter(x => x.faction_id === faction_id)
    }

    static getEnemies(activity:WarMember[]) {
        return activity.filter(x => x.faction_id !== faction_id)
    }

    static getConflicts(allies: WarMember[], enemies: WarMember[]){

        const enemiesToCheck = enemies
            .filter((enemy) => !enemy.alerted)

        const travelingEnemies = enemiesToCheck
            .filter(enemy => enemy.location.destination && enemy.location.destination !== Locations.torn)

        const riskyAllies = allies
            .filter(x => (x.location.current != Locations.torn && !x.location.destination) || x.location.destination && x.location.destination !== Locations.torn)

        return travelingEnemies.map(enemy => {
            const threatenedAllies = riskyAllies.filter(ally =>
                !ally.alerted && (!ally.location.initiated || ally.location.initiated < enemy.location.initiated!) &&
                (enemy.location.destination === ally.location.current ||
                enemy.location.destination === ally.location.destination)
            )

            return threatenedAllies.length > 0 ? {
                enemy,
                threatenedAllies
            } : null
        }).filter(Boolean) as Chased[]
    }
}
