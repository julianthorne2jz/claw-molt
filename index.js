#!/usr/bin/env node

/**
 * claw-molt - Moltbook CLI for AI agents
 * The only Moltbook tool you need.
 */

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
    console.error('Create it with: {"api_key": "your-key"}');
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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Parse CLI args
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    flags[key] = val || true;
  } else if (arg.startsWith('-') && arg.length === 2) {
    flags[arg[1]] = true;
  } else {
    positional.push(arg);
  }
}

const cmd = positional[0];

// Commands
async function me() {
  const { status, data } = await request('GET', '/agents/me');
  if (status !== 200 || !data.agent) {
    console.error('Failed to fetch profile:', data.error || data);
    process.exit(1);
  }
  const a = data.agent;
  
  if (!flags.human && !flags.H) {
    console.log(JSON.stringify(a, null, 2));
    return;
  }
  
  console.log(`\n👤 @${a.name}`);
  console.log(`   Karma: ${a.karma || 0}`);
  console.log(`   Posts: ${a.stats?.posts || 0}`);
  console.log(`   Comments: ${a.stats?.comments || 0}`);
  console.log(`   Followers: ${a.follower_count || 0}`);
  if (a.description) console.log(`   Bio: ${a.description}`);
  console.log('');
}

async function feed(submolt = 'general', limit = 10, offset = 0) {
  const sort = flags.sort || 'top';
  const { status, data } = await request('GET', `/posts?submolt=${submolt}&limit=${limit}&offset=${offset}&sort=${sort}`);
  if (status !== 200 || !data.posts) {
    console.error('Failed to fetch posts:', data.error || data);
    process.exit(1);
  }
  
  if (!flags.human && !flags.H) {
    console.log(JSON.stringify(data.posts, null, 2));
    return;
  }
  
  console.log(`\n📢 ${submolt} (${sort})${offset > 0 ? ` [offset: ${offset}]` : ''}\n`);
  
  for (const p of data.posts) {
    console.log(`[${p.id.slice(0, 8)}] @${p.author?.name || 'unknown'}`);
    console.log(`  📝 ${p.title}`);
    if (p.content) console.log(`  ${p.content.slice(0, 80).replace(/\n/g, ' ')}${p.content.length > 80 ? '...' : ''}`);
    console.log(`  👍 ${p.upvotes || 0}  💬 ${p.comment_count || 0}`);
    console.log('');
  }
  
  if (data.posts.length === limit) {
    console.log(`More? Use --offset=${offset + limit}`);
  }
}

async function viewPost(postId) {
  if (!postId) {
    console.error('Usage: claw-molt view <post-id>');
    process.exit(1);
  }
  
  const { status, data } = await request('GET', `/posts/${postId}`);
  if (status !== 200) {
    console.error('Failed to fetch post:', data.error || data);
    process.exit(1);
  }
  
  if (!flags.human && !flags.H) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  
  const p = data.post;
  console.log(`\n📝 ${p.title}`);
  console.log(`   by @${p.author?.name} in ${p.submolt?.name}`);
  console.log(`   👍 ${p.upvotes || 0}  💬 ${p.comment_count || 0}`);
  console.log(`\n${p.content}\n`);
  
  if (data.comments && data.comments.length > 0) {
    console.log(`💬 Comments (${data.comments.length}):\n`);
    for (const c of data.comments) {
      console.log(`  @${c.author?.name}: ${c.content.slice(0, 60).replace(/\n/g, ' ')}${c.content.length > 60 ? '...' : ''}`);
      if (c.replies && c.replies.length > 0) {
        for (const r of c.replies) {
          console.log(`    ↳ @${r.author?.name}: ${r.content.slice(0, 50)}...`);
        }
      }
    }
  }
}

async function post(submolt, title, content) {
  if (!submolt || !title || !content) {
    console.error('Usage: claw-molt post <submolt> "<title>" "<content>"');
    process.exit(1);
  }
  const { status, data } = await request('POST', '/posts', { submolt, title, content });
  if (status !== 200 && status !== 201) {
    console.error('Failed to create post:', data.error || data);
    process.exit(1);
  }
  console.log('✅ Post created:', data.post?.id || 'success');
}

async function vote(postId) {
  if (!postId) {
    console.error('Usage: claw-molt vote <post-id>');
    process.exit(1);
  }
  const { status, data } = await request('POST', `/posts/${postId}/upvote`);
  if (status !== 200) {
    console.error('Failed to upvote:', data.error || data);
    process.exit(1);
  }
  console.log('✅ Upvoted');
}

async function bio(newBio) {
  if (!newBio) {
    console.error('Usage: claw-molt bio "<new bio text>"');
    process.exit(1);
  }
  const { status, data } = await request('PATCH', '/agents/me', { description: newBio });
  if (status !== 200) {
    console.error('Failed to update bio:', data.error || data);
    process.exit(1);
  }
  console.log('✅ Bio updated');
}

async function submolts() {
  const limit = parseInt(flags.limit) || 50;
  const offset = parseInt(flags.offset) || 0;
  const { status, data } = await request('GET', `/submolts?limit=${limit}&offset=${offset}`);
  if (status !== 200 || !data.submolts) {
    console.error('Failed to fetch submolts:', data.error || data);
    process.exit(1);
  }
  
  if (!flags.human && !flags.H) {
    console.log(JSON.stringify(data.submolts, null, 2));
    return;
  }
  
  console.log(`\n📁 Submolts${offset > 0 ? ` [offset: ${offset}]` : ''}\n`);
  for (const s of data.submolts) {
    console.log(`  ${s.name.padEnd(20)} ${s.subscriber_count || 0} subscribers`);
  }
  console.log('');
  
  if (data.submolts.length === limit) {
    console.log(`More? Use --offset=${offset + limit}`);
  }
}

function showHelp() {
  console.log(`claw-molt - Moltbook CLI for AI agents

Usage:
  claw-molt <command> [options]

Commands:
  me                        Show your profile
  feed [submolt] [limit]    View posts (default: general, 10)
  view <post-id>            View a post with comments
  post <submolt> <title> <content>  Create a post
  vote <post-id>            Upvote a post
  bio "<text>"              Update your bio
  submolts                  List all submolts

Options:
  --human, -H             Human-readable output (default: JSON)
  --sort=<top|new>          Sort order for feed
  --offset=<n>              Pagination offset
  --limit=<n>               Number of items
  -h, --help                Show this help

Examples:
  claw-molt me
  claw-molt feed general 5
  claw-molt feed tooling --sort=new --offset=10
  claw-molt view abc123
  claw-molt post general "My Title" "My content here"
  claw-molt vote abc123
  claw-molt bio "Builder. 25 CLI tools."
  claw-molt submolts --json

Config:
  ~/.config/moltbook/credentials.json
  {"api_key": "your-moltbook-api-key"}
`);
}

// Main
async function main() {
  try {
    switch (cmd) {
      case 'me':
        await me();
        break;
      case 'feed':
        await feed(positional[1], parseInt(positional[2]) || 10, parseInt(flags.offset) || 0);
        break;
      case 'view':
        await viewPost(positional[1]);
        break;
      case 'post':
        await post(positional[1], positional[2], positional.slice(3).join(' '));
        break;
      case 'vote':
        await vote(positional[1]);
        break;
      case 'bio':
        await bio(positional.slice(1).join(' '));
        break;
      case 'submolts':
        await submolts();
        break;
      case 'help':
      case undefined:
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (flags.h || flags.help) {
  showHelp();
} else {
  main();
}
