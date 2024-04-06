import axios from "axios";
import CryptoJS from "crypto-js";
import process from "node:process";
import gistIDs from "./gists.js";

// CONFIG
const FOOTBALL_ID = '1';

const domains = {
  viet: 'https://json.vnres.co',
  china: 'https://json.xuean.xyz',
};

const descriptions = {
  viet: 'rock it...',
  china: 'lalaland...'
}

async function fetchAndEncryptMatches(country) {
  try {
    const response = await axios.get(`${domains[country]}/matches.json`);
    logWithTimestamp("Fetched matches with status code: " + response.status);

    if (response.status !== 200) {
      logWithTimestamp("Fetched matches non 200 response");
      return;
    }

    const matches = parseMatchesData(response.data);
    const matchesWithLiveLinks = await getMatchesWithStreamLinks(matches, country);
    const encryptedData = encryptData(matchesWithLiveLinks);
    await updateGist(encryptedData, country);
  } catch (err) {
    logWithTimestamp(err);
  }
}

async function updateGist(encrypteddata, country) {
  await axios.patch(`https://api.github.com/gists/${gistIDs[country]}`,
    {
      description: descriptions[country],
      files: {
        'data.json': { content: encrypteddata }
      }
    },
    {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${process.env.TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      }
    });
}

function encryptData(data) {
  const textToEncrypt = JSON.stringify(data);
  return CryptoJS.AES.encrypt(
    textToEncrypt,
    CryptoJS.enc.Utf8.parse(process.env.PASSWORD),
    {
      iv: CryptoJS.enc.Utf8.parse("\0".repeat(16)),
      mode: CryptoJS.mode.CTR,
      padding: CryptoJS.pad.Pkcs7
    }
  ).toString();
}

async function getMatchesWithStreamLinks(matches, country) {
  const matchesWithStreamLinks = [];
  for (const match of matches) {
    const roomNumbers = match.anchors.map(anchor => anchor.anchor.roomNum);
    const streamLinks = await getStreamLinks(roomNumbers, country);
    matchesWithStreamLinks.push({
      subCateName: match.subCateName,
      hostName: match.hostName,
      hostIcon: match.hostIcon,
      guestName: match.guestName,
      guestIcon: match.guestIcon,
      matchTime: match.matchTime,
      roomNumbers,
      streamLinks,
    });
  }
  return matchesWithStreamLinks;
}

async function getStreamLinks(roomNumbers, country) {
  const streamLinks = [];
  for (const roomNum of roomNumbers) {
    try {
      const response = await axios.get(`${domains[country]}/room/${roomNum}/detail.json`);
      if (response.status !== 200) {
        continue;
      }
      const jsonString = response.data.replace('detail(', '').slice(0, -1);
      const stream = JSON.parse(jsonString).data.stream;
      if ('m3u8' in stream) {
        streamLinks.push(stream.m3u8);
      }
      if ('hdM3u8' in stream) {
        streamLinks.push(stream.hdM3u8);
      }
    } catch (err) {
      logWithTimestamp(`${err.code}, ${err.config.url}, ${err.response.status}`);
    } finally {
      logWithTimestamp(`fetch stream links for room: ${roomNum}`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  return streamLinks;
}

function parseMatchesData(data) {
  const jsonString = data.replace('matches(', '').slice(0, -1);
  return JSON.parse(jsonString).data[FOOTBALL_ID];
}

function logWithTimestamp(...args) {
  const localDateTime = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    millisecond: 'numeric',
    hour12: true // To include AM/PM
  }).replace(/,/g, ''); // To remove commas from the output

  console.log(localDateTime, ...args);
}

export default async function fetchFor(country) {
  console.time('fetch');
  await fetchAndEncryptMatches(country);
  console.timeEnd('fetch');
  console.log('');
}
