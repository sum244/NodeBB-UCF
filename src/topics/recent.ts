
import db = require('../database');
import plugins = require('../plugins');
import posts = require ('../posts');

type Topics = {
    getRecentTopics: (cid: string, uid: string, start: string, stop: string, filter: string) => Promise<Topics[]>;
    getSortedTopics: (arg0: { cids: string; uid: string; start: string; stop: string; filter: string;
        sort: string; }) => Promise<Topics[]>;
    getLatestTopics: (options: { start: string; stop: string; term: number; uid: string; }) =>
        Promise<{ topics: Topics[]; nextStart: string; }>;
    getLatestTidsFromSet: (set: string, start: string, stop: string, term: number) => Promise<string[]>;
    getTopics: (tids: string[], options: { start: string; stop: string; term: number; uid: string; }) =>
        Promise<Topics[]>;
    updateLastPostTimeFromLastPid: (tid: string) => Promise<void>;
    getLatestUndeletedPid: (tid: string) => Promise<string>;
    updateLastPostTime: (tid: string, timestamp: string) => Promise<void>;
    setTopicField: (tid: string, arg1: string, lastposttime: string) => Promise<void>;
    getTopicFields: (tid: string, arg1: string[]) => Promise<tData>;
    updateRecent: (tid: string, lastposttime: string) => Promise<void>;
}

interface tData {
    cid: string;
    pinned: boolean;
}

module.exports = function (Topics: Topics) {
    const terms: { [key: string]: number } = {
        day: 86400000,
        week: 604800000,
        month: 2592000000,
        year: 31104000000,
    } as const;

    Topics.getRecentTopics = async function (cid: string, uid: string, start: string, stop: string, filter: string) {
        return await Topics.getSortedTopics({
            cids: cid,
            uid: uid,
            start: start,
            stop: stop,
            filter: filter,
            sort: 'recent',
        });
    };

    /* not an orphan method, used in widget-essentials */
    Topics.getLatestTopics = async function (options: { start: string, stop: string, term: number, uid: string }) {
        // uid, start, stop, term
        const tids = await Topics.getLatestTidsFromSet('topics:recent', options.start, options.stop, options.term);
        const topics = await Topics.getTopics(tids, options);
        return { topics: topics, nextStart: String(parseInt(options.stop, 10) + 1) };
    };

    Topics.getLatestTidsFromSet = async function (set: string, start: string, stop: string, term: number):
        Promise<string[]> {
        let since: number = terms.day;
        if (terms[term]) {
            since = terms[term];
        }

        const count = parseInt(stop, 10) === -1 ? stop : parseInt(stop, 10) - parseInt(start, 10) + 1;
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
          @typescript-eslint/no-unsafe-return */
        return await db.getSortedSetRevRangeByScore(set, start, count, '+inf', Date.now() - since);
    };

    Topics.updateLastPostTimeFromLastPid = async function (tid: string) {
        const pid = await Topics.getLatestUndeletedPid(tid);
        if (!pid) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
          @typescript-eslint/no-unsafe-assignment */
        const timestamp = await posts.getPostField(pid, 'timestamp');
        if (!timestamp) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
          @typescript-eslint/no-unsafe-argument */
        await Topics.updateLastPostTime(tid, timestamp);
    };

    Topics.updateLastPostTime = async function (tid: string, lastposttime: string) {
        await Topics.setTopicField(tid, 'lastposttime', lastposttime);
        const topicData = await Topics.getTopicFields(tid, ['cid', 'deleted', 'pinned']);

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetAdd(`cid:${topicData.cid}:tids:lastposttime`, lastposttime, tid);

        await Topics.updateRecent(tid, lastposttime);

        if (!topicData.pinned) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.sortedSetAdd(`cid:${topicData.cid}:tids`, lastposttime, tid);
        }
    };

    Topics.updateRecent = async function (tid: string, timestamp: string) {
        let data = { tid: tid, timestamp: timestamp };
        if (plugins.hooks.hasListeners('filter:topics.updateRecent')) {
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
               @typescript-eslint/no-unsafe-assignment */
            data = await plugins.hooks.fire('filter:topics.updateRecent', { tid: tid, timestamp: timestamp });
        }
        if (data && data.tid && data.timestamp) {
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
               @typescript-eslint/no-unsafe-return */
            await db.sortedSetAdd('topics:recent', data.timestamp, data.tid);
        }
    };
};
