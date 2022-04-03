import { Event } from '../events/events';

import { BackendMethod, Remult, SqlDatabase } from 'remult';
import { EventInList, eventStatus } from '../events/events';
import { Helpers, HelpersBase } from '../helpers/helpers';
import { Phone } from '../model-shared/phone';
import { Sites } from '../sites/sites';
import { createSiteContext } from '../helpers/init-context';
import { setSettingsForSite } from '../manage/ApplicationSettings';
import { SqlBuilder, SqlFor } from '../model-shared/SqlBuilder';



export class OrgEventsController {
    @BackendMethod({ allowed: true })
    static async getAllEvents(phone: string, sitesFilter: string, remult?: Remult, db?: SqlDatabase): Promise<EventInList[]> {
        let r: EventInList[] = [];
        let sql = new SqlBuilder(remult);
        let e = SqlFor(remult.repo(Event));

        let schemas = Sites.schemas;
        if (sitesFilter) {
            let x = sitesFilter.split(',');
            if (x.length > 0)
                schemas = x;
        }
        let query = '';
        for (const org of schemas) {
            if (query != '')
                query += ' union all ';
            query += await sql.build('select ', ["'" + org + "' site"], ' from ', org + '.' + await e.metadata.getDbName(),
                " where ", [e.where({ eventStatus: eventStatus.active, eventDate: { ">=": new Date() } })]);
        }
        let sites = (await db.execute(' select distinct site from (' + query + ') x')).rows.map(x => x.site);

        for (const org of sites) {

            let c = await createSiteContext(org, remult);

            let settings = await c.getSettings();
            setSettingsForSite(org, settings);


            if (!settings.donotShowEventsInGeneralList && !settings.forWho.args.leftToRight) {
                let items = await OrgEventsController.getEvents(phone, '', c);
                r.push(...items.map(i => ({ ...i, site: org })));
            }

        }
        return r;
    }

    @BackendMethod({ allowed: true })
    static async getEvents(phone: string, specificUrl?: string, remult?: Remult): Promise<EventInList[]> {

        if (!specificUrl)
            specificUrl = '';
        let helper: HelpersBase = (await remult.getCurrentUser());
        if (!helper && phone)
            helper = await remult.repo(Helpers).findFirst({ phone: new Phone(phone) });
        return Promise.all((await remult.repo(Event).find({
            orderBy: { eventDate: "asc", startTime: "asc" },
            where: { eventStatus: eventStatus.active, eventDate: { ">=": new Date() }, specificUrl }
        })).map(async e => await e.toEventInList(helper)));
    }
}