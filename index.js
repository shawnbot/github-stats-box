#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { request } = require('@octokit/request');
const { userInfoFetcher, totalCommitsFetcher } = require('./fetch');
const numeral = require('numeral');

const gistId = process.env.GIST_ID;
const githubToken = process.env.GH_TOKEN;
const countAllCommits = process.env.ALL_COMMITS.toString() === 'true';
const kFormat = process.env.K_FORMAT.toString() === 'true';

async function main() {
    if (!githubToken) {
        throw new Error('GH_TOKEN is not defined');
    }
    let stats;
    try {
        stats = await getStats();
    } catch (e) {
        throw new Error(`cannot retrieve statistics: ${e.message}`);
    }
    try {
        await updateGist(stats);
    } catch (e) {
        throw new Error(`cannot update gist: ${e.message}`);
    }
}

async function getStats() {
    const stats = {
        name: '',
        totalPRs: 0,
        totalCommits: 0,
        totalIssues: 0,
        totalStars: 0,
        contributedTo: 0,
    };

    const user = await userInfoFetcher(githubToken).then((res) => res.data.data.viewer);

    stats.name = user.name || user.login;
    stats.totalPRs = user.pullRequests.totalCount;
    stats.totalIssues = user.issues.totalCount;
    stats.contributedTo = user.repositoriesContributedTo.totalCount;
    stats.totalStars = user.repositories.nodes.reduce((prev, curr) => {
        return prev + curr.stargazers.totalCount;
    }, 0);

    stats.totalCommits = user.contributionsCollection.totalCommitContributions;
    if (countAllCommits) {
        stats.totalCommits = await totalCommitsFetcher(user.login, githubToken);
    }

    return stats;
}

async function updateGist(stats) {
    const humanize = (n) => (n >= 1000 ? numeral(n).format(kFormat ? '0.0a' : '0,0') : n);

    const gistContent =
        [
            // ['⭐', `Total Stars`, humanize(stats.totalStars)],
            ['➕', countAllCommits ? 'Commits' : 'Commits (past year)', humanize(stats.totalCommits)],
            ['🔀', `Pull requests`, humanize(stats.totalPRs)],
            ['🚩', `Issues`, humanize(stats.totalIssues)],
            ['📦', `Contributed to`, humanize(stats.contributedTo)],
        ]
            .map(([icon, label, value]) => {
                const line = `${icon}  ${label} `
                const pad = ' '.repeat(48 - line.length - value.length)
                return `${line}${pad}${value}`
            })
            .join('\n') + '\n';

    const gist = await request('GET /gists/:gist_id', {
        gist_id: gistId,
        headers: { authorization: `token ${githubToken}` },
    });
    const filename = Object.keys(gist.data.files)[0];

    if (gist.data.files[filename].content === gistContent) {
        console.info('Nothing to update');
        return;
    }

    return request('PATCH /gists/:gist_id', {
        files: {
            [filename]: {
                filename: `${stats.name}'s GitHub Stats`,
                content: gistContent,
            },
        },
        gist_id: gistId,
        headers: { authorization: `token ${githubToken}` },
    }).then(() => {
        console.info(`Updated Gist ${gistId} with the following content:\n${gistContent}`);
    });
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
