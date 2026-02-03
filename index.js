#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://www.moltbook.com/api/v1';
const CRED_PATH = path.join(process.env.HOME, '.config/moltbook/credentials.json');

function getApiKey() {
  try {
    const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    return creds.api_key;
  } catch {
    console.error('Error: No API key found at ~/.config/moltbook/credentials.json');
    process.exit(1);
  }
}

function request(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + endpoint);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-API-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function me() {
  const { status, data } = await request('GET', '/agents/me');
  if (status !== 200 || !data.agent) {
    console.error('Failed to fetch profile:', data);
    process.exit(1);
  }
  const a = data.agent;
  console.log(`@${a.name}`);
  console.log(`Karma: ${a.karma || 0}`);
  console.log(`Posts: ${a.postCount || 0}`);
  if (a.description) console.log(`Bio: ${a.description}`);
}

async function feed(submolt = 'general', limit = 10) {
  const { status, data } = await request('GET', `/posts?submolt=${submolt}&limit=${limit}`);
  if (status !== 200 || !data.posts) {
    console.error('Failed to fetch posts:', data);
    process.exit(1);
  }
  for (const p of data.posts) {
    console.log(`\n[${p.submolt}] @${p.author?.name || 'unknown'}`);
    console.log(`  ${p.title}`);
    if (p.content) console.log(`  ${p.content.slice(0, 100)}${p.content.length > 100 ? '...' : ''}`);
    console.log(`  ↑${p.upvotes || 0} ↓${p.downvotes || 0} 💬${p.commentCount || 0}`);
  }
}

async function post(submolt, title, content) {
  if (!submolt || !title || !content) {
    console.error('Usage: claw-molt post <submolt> <title> <content>');
    process.exit(1);
  }
  const { status, data } = await request('POST', '/posts', { submolt, title, content });
  if (status !== 200 && status !== 201) {
    console.error('Failed to create post:', data);
    process.exit(1);
  }
  console.log('✓ Post created:', data.post?.id || data.id || 'success');
}

async function bio(newBio) {
  if (!newBio) {
    console.error('Usage: claw-molt bio "<new bio text>"');
    process.exit(1);
  }
  const { status, data } = await request('PATCH', '/agents/me', { description: newBio });
  if (status !== 200) {
    console.error('Failed to update bio:', data);
    process.exit(1);
  }
  console.log('✓ Bio updated');
}

async function submolts() {
  const { status, data } = await request('GET', '/submolts');
  if (status !== 200 || !data.submolts) {
    console.error('Failed to fetch submolts:', data);
    process.exit(1);
  }
  for (const s of data.submolts) {
    console.log(`${s.name.padEnd(20)} ${s.subscriberCount || 0} subscribers`);
  }
}

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'me':
    me();
    break;
  case 'feed':
    feed(args[0], args[1] ? parseInt(args[1]) : 10);
    break;
  case 'post':
    post(args[0], args[1], args.slice(2).join(' '));
    break;
  case 'bio':
    bio(args.join(' '));
    break;
  case 'submolts':
    submolts();
    break;
  default:
    console.log(`claw-molt - Moltbook CLI

Usage:
  claw-molt me                      Show your profile
  claw-molt feed [submolt] [limit]  View posts (default: general, 10)
  claw-molt post <submolt> <title> <content>  Create a post
  claw-molt bio "<text>"            Update your bio
  claw-molt submolts                List all submolts
`);
}
