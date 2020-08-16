

/**
 * Administration commands
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * These are administration commands, generally only useful for
 * programmers for managing the server.
 *
 * For the API, see chat-plugins/COMMANDS.md
 *
 * @license MIT
 */

import * as child_process from 'child_process';
import {FS} from '../../lib/fs';
import {Utils} from '../../lib/utils';

import * as ProcessManager from '../../lib/process-manager';
import { ChatRoom } from '../rooms';

export const commands: ChatCommands = {

	/*********************************************************
	 * Bot commands (chat-log manipulation)
	 *********************************************************/

	htmlbox(target, room, user) {
		if (!target) return this.parse('/help htmlbox');
		if (!room) return this.requiresRoom();
		target = this.canHTML(target)!;
		if (!target) return;
		target = Chat.collapseLineBreaksHTML(target);
		if (!this.canBroadcast(true, '!htmlbox')) return;
		if (this.broadcastMessage && !this.can('declare', null, room)) return false;

		if (!this.runBroadcast(true, '!htmlbox')) return;

		if (this.broadcasting) {
			return `/raw <div class="infobox">${target}</div>`;
		} else {
			this.sendReplyBox(target);
		}
	},
	htmlboxhelp: [
		`/htmlbox [message] - Displays a message, parsing HTML code contained.`,
		`!htmlbox [message] - Shows everyone a message, parsing HTML code contained. Requires: * # &`,
	],
	addhtmlbox(target, room, user, connection, cmd) {
		if (!target) return this.parse('/help ' + cmd);
		if (!room) return this.requiresRoom();
		if (!this.canTalk()) return;
		target = this.canHTML(target)!;
		if (!target) return;
		if (!this.can('addhtml', null, room)) return;
		target = Chat.collapseLineBreaksHTML(target);
		if (!user.can('addhtml')) {
			target += Utils.html`<div style="float:right;color:#888;font-size:8pt">[${user.name}]</div><div style="clear:both"></div>`;
		}

		return `/raw <div class="infobox">${target}</div>`;
	},
	addhtmlboxhelp: [
		`/addhtmlbox [message] - Shows everyone a message, parsing HTML code contained. Requires: * # &`,
	],
	addrankhtmlbox(target, room, user, connection, cmd) {
		if (!room) return this.requiresRoom();
		if (!target) return this.parse('/help ' + cmd);
		if (!this.canTalk()) return;
		let [rank, html] = this.splitOne(target);
		if (!(rank in Config.groups)) return this.errorReply(`Group '${rank}' does not exist.`);
		html = this.canHTML(html)!;
		if (!html) return;
		if (!this.can('addhtml', null, room)) return;
		html = Chat.collapseLineBreaksHTML(html);
		if (!user.can('addhtml')) {
			html += Utils.html`<div style="float:right;color:#888;font-size:8pt">[${user.name}]</div><div style="clear:both"></div>`;
		}

		room.sendRankedUsers(`|html|<div class="infobox">${html}</div>`, rank as GroupSymbol);
	},
	addrankhtmlboxhelp: [
		`/addrankhtmlbox [rank], [message] - Shows everyone with the specified rank or higher a message, parsing HTML code contained. Requires: * # &`,
	],
	changeuhtml: 'adduhtml',
	adduhtml(target, room, user, connection, cmd) {
		if (!room) return this.requiresRoom();
		if (!target) return this.parse('/help ' + cmd);
		if (!this.canTalk()) return;

		let [name, html] = this.splitOne(target);
		name = toID(name);
		html = this.canHTML(html)!;
		if (!html) return this.parse(`/help ${cmd}`);
		if (!this.can('addhtml', null, room)) return;
		html = Chat.collapseLineBreaksHTML(html);
		if (!user.can('addhtml')) {
			html += Utils.html`<div style="float:right;color:#888;font-size:8pt">[${user.name}]</div><div style="clear:both"></div>`;
		}

		if (cmd === 'changeuhtml') {
			room.attributedUhtmlchange(user, name, html);
		} else {
			return `/uhtml ${name},${html}`;
		}
	},
	adduhtmlhelp: [
		`/adduhtml [name], [message] - Shows everyone a message that can change, parsing HTML code contained.  Requires: * # &`,
	],
	changeuhtmlhelp: [
		`/changeuhtml [name], [message] - Changes the message previously shown with /adduhtml [name]. Requires: * # &`,
	],
	changerankuhtml: 'addrankuhtml',
	addrankuhtml(target, room, user, connection, cmd) {
		if (!room) return this.requiresRoom();
		if (!target) return this.parse('/help ' + cmd);
		if (!this.canTalk()) return;

		const [rank, uhtml] = this.splitOne(target);
		if (!(rank in Config.groups)) return this.errorReply(`Group '${rank}' does not exist.`);
		let [name, html] = this.splitOne(uhtml);
		name = toID(name);
		html = this.canHTML(html)!;
		if (!html) return;
		if (!this.can('addhtml', null, room)) return;
		html = Chat.collapseLineBreaksHTML(html);
		if (!user.can('addhtml')) {
			html += Utils.html`<div style="float:right;color:#888;font-size:8pt">[${user.name}]</div><div style="clear:both"></div>`;
		}

		html = `|uhtml${(cmd === 'changerankuhtml' ? 'change' : '')}|${name}|${html}`;
		room.sendRankedUsers(html, rank as GroupSymbol);
	},
	addrankuhtmlhelp: [
		`/addrankuhtml [rank], [name], [message] - Shows everyone with the specified rank or higher a message that can change, parsing HTML code contained.  Requires: * # &`,
	],
	changerankuhtmlhelp: [
		`/changerankuhtml [rank], [name], [message] - Changes the message previously shown with /addrankuhtml [rank], [name]. Requires: * # &`,
	],

	addline(target, room, user) {
		if (!this.can('rawpacket')) return false;
		// secret sysop command
		this.add(target);
	},

	pminfobox(target, room, user, connection) {
		if (!this.canTalk()) return;
		if (!room) return this.requiresRoom();
		if (!this.can('addhtml', null, room)) return false;
		if (!target) return this.parse("/help pminfobox");

		target = this.canHTML(this.splitTarget(target))!;
		if (!target) return;
		const targetUser = this.targetUser!;
		if (!this.canPMHTML(targetUser)) return;

		// Apply the infobox to the message
		target = `/raw <div class="infobox">${target}</div>`;
		const message = `|pm|${user.getIdentity()}|${targetUser.getIdentity()}|${target}`;

		user.send(message);
		if (targetUser !== user) targetUser.send(message);
		targetUser.lastPM = user.id;
		user.lastPM = targetUser.id;
	},
	pminfoboxhelp: [`/pminfobox [user], [html]- PMs an [html] infobox to [user]. Requires * # &`],

	pmuhtmlchange: 'pmuhtml',
	pmuhtml(target, room, user, connection, cmd) {
		if (!this.canTalk()) return;
		if (!room) return this.requiresRoom();
		if (!this.can('addhtml', null, room)) return false;
		if (!target) return this.parse("/help " + cmd);

		target = this.canHTML(this.splitTarget(target))!;
		if (!target) return;
		const targetUser = this.targetUser!;
		if (!this.canPMHTML(targetUser)) return;

		const message = `|pm|${user.getIdentity()}|${targetUser.getIdentity()}|/uhtml${(cmd === 'pmuhtmlchange' ? 'change' : '')} ${target}`;

		user.send(message);
		if (targetUser !== user) targetUser.send(message);
		targetUser.lastPM = user.id;
		user.lastPM = targetUser.id;
	},
	pmuhtmlhelp: [`/pmuhtml [user], [name], [html] - PMs [html] that can change to [user]. Requires * # &`],
	pmuhtmlchangehelp: [
		`/pmuhtmlchange [user], [name], [html] - Changes html that was previously PMed to [user] to [html]. Requires * # &`,
	],

	sendhtmlpage(target, room, user) {
		if (!room) return this.requiresRoom();
		if (!this.can('addhtml', null, room)) return false;
		let [targetID, pageid, content] = Utils.splitFirst(target, ',', 2);
		if (!target || !pageid || !content) return this.parse(`/help sendhtmlpage`);

		pageid = `${user.id}-${toID(pageid)}`;

		const targetUser = Users.get(targetID)!;
		if (!targetUser || !targetUser.connected) {
			this.errorReply(`User ${this.targetUsername} is not currently online.`);
			return false;
		}
		if (targetUser.locked && !this.user.can('lock')) {
			this.errorReply("This user is currently locked, so you cannot send them HTML.");
			return false;
		}

		let targetConnections = [];
		// find if a connection has specifically requested this page
		for (const c of targetUser.connections) {
			if (c.lastRequestedPage === pageid) {
				targetConnections.push(c);
			}
		}
		if (!targetConnections.length) {
			// no connection has requested it - verify that we share a room
			if (!this.canPMHTML(targetUser)) return;
			targetConnections = [targetUser.connections[0]];
		}

		content = this.canHTML(content)!;
		if (!content) return;

		for (const targetConnection of targetConnections) {
			const context = new Chat.PageContext({
				user: targetUser,
				connection: targetConnection,
				pageid: `view-bot-${pageid}`,
			});
			context.title = `[${user.name}] ${pageid}`;
			context.send(content);
		}
	},
	sendhtmlpagehelp: [
		`/sendhtmlpage: [target], [page id], [html] - sends the [target] a HTML room with the HTML [content] and the [pageid]. Requires: * # &`,
	],
	nick() {
		this.sendReply(`||New to the Pokémon Showdown protocol? Your client needs to get a signed assertion from the login server and send /trn`);
		this.sendReply(`||https://github.com/smogon/pokemon-showdown/blob/master/PROTOCOL.md#global-messages`);
		this.sendReply(`||Follow the instructions for handling |challstr| in this documentation`);
	},

	/*********************************************************
	 * Server management commands
	 *********************************************************/

	memusage: 'memoryusage',
	memoryusage(target) {
		if (!this.can('lockdown')) return false;
		const memUsage = process.memoryUsage();
		const resultNums = [memUsage.rss, memUsage.heapUsed, memUsage.heapTotal];
		const units = ["B", "KiB", "MiB", "GiB", "TiB"];
		const results = resultNums.map(num => {
			const unitIndex = Math.floor(Math.log2(num) / 10); // 2^10 base log
			return `${(num / Math.pow(2, 10 * unitIndex)).toFixed(2)} ${units[unitIndex]}`;
		});
		this.sendReply(`||[Main process] RSS: ${results[0]}, Heap: ${results[1]} / ${results[2]}`);
	},

	forcehotpatch: 'hotpatch',
	async hotpatch(target, room, user, connection, cmd) {
		if (!target) return this.parse('/help hotpatch');
		if (!this.canUseConsole()) return false;

		if (Monitor.updateServerLock) {
			return this.errorReply("Wait for /updateserver to finish before hotpatching.");
		}
		const lock = Monitor.hotpatchLock;
		const hotpatches = ['chat', 'formats', 'loginserver', 'punishments', 'dnsbl', 'modlog'];
		const version = await Monitor.version();
		const requiresForce = (patch: string) =>
			version && cmd !== 'forcehotpatch' &&
			(Monitor.hotpatchVersions[patch] ?
				Monitor.hotpatchVersions[patch] === version :
				(global.__version && version === global.__version.tree));
		const requiresForceMessage = `The git work tree has not changed since the last time ${target} was hotpatched (${version?.slice(0, 8)}), use /forcehotpatch ${target} if you wish to hotpatch anyway.`;

		let patch = target;
		try {
			Utils.clearRequireCache({exclude: ['/.lib-dist/process-manager']});
			if (target === 'all') {
				if (lock['all']) {
					return this.errorReply(`Hot-patching all has been disabled by ${lock['all'].by} (${lock['all'].reason})`);
				}
				if (Config.disablehotpatchall) {
					return this.errorReply("This server does not allow for the use of /hotpatch all");
				}

				for (const hotpatch of hotpatches) {
					this.parse(`/hotpatch ${hotpatch}`);
				}
			} else if (target === 'chat' || target === 'commands') {
				patch = 'chat';
				if (lock['chat']) {
					return this.errorReply(`Hot-patching chat has been disabled by ${lock['chat'].by} (${lock['chat'].reason})`);
				}
				if (lock['tournaments']) {
					return this.errorReply(`Hot-patching tournaments has been disabled by ${lock['tournaments'].by} (${lock['tournaments'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				Chat.destroy();

				const processManagers = ProcessManager.processManagers;
				for (const manager of processManagers.slice()) {
					if (
						manager.filename.startsWith(FS('server/chat-plugins').path) ||
						manager.filename.startsWith(FS('.server-dist/chat-plugins').path)
					) {
						void manager.destroy();
					}
				}

				global.Chat = require('../chat').Chat;
				global.Tournaments = require('../tournaments').Tournaments;

				this.sendReply("Chat commands have been hot-patched.");
				Chat.loadPlugins();
				this.sendReply("Chat plugins have been loaded.");
			} else if (target === 'tournaments') {
				if (lock['tournaments']) {
					return this.errorReply(`Hot-patching tournaments has been disabled by ${lock['tournaments'].by} (${lock['tournaments'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				global.Tournaments = require('../tournaments').Tournaments;
				Chat.loadPluginData(Tournaments);
				this.sendReply("Tournaments have been hot-patched.");
			} else if (target === 'formats' || target === 'battles') {
				patch = 'formats';
				if (lock['formats']) {
					return this.errorReply(`Hot-patching formats has been disabled by ${lock['formats'].by} (${lock['formats'].reason})`);
				}
				if (lock['battles']) {
					return this.errorReply(`Hot-patching battles has been disabled by ${lock['battles'].by} (${lock['battles'].reason})`);
				}
				if (lock['validator']) {
					return this.errorReply(`Hot-patching the validator has been disabled by ${lock['validator'].by} (${lock['validator'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				// reload .sim-dist/dex.js
				global.Dex = require('../../sim/dex').Dex;
				// rebuild the formats list
				delete Rooms.global.formatList;
				// respawn validator processes
				void TeamValidatorAsync.PM.respawn();
				// respawn simulator processes
				void Rooms.PM.respawn();
				// broadcast the new formats list to clients
				Rooms.global.sendAll(Rooms.global.formatListText);

				this.sendReply("Formats have been hot-patched.");
			} else if (target === 'loginserver') {
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);
				FS('config/custom.css').unwatch();
				global.LoginServer = require('../loginserver').LoginServer;
				this.sendReply("The login server has been hot-patched. New login server requests will use the new code.");
			} else if (target === 'learnsets' || target === 'validator') {
				patch = 'validator';
				if (lock['validator']) {
					return this.errorReply(`Hot-patching the validator has been disabled by ${lock['validator'].by} (${lock['validator'].reason})`);
				}
				if (lock['formats']) {
					return this.errorReply(`Hot-patching formats has been disabled by ${lock['formats'].by} (${lock['formats'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				void TeamValidatorAsync.PM.respawn();
				this.sendReply("The team validator has been hot-patched. Any battles started after now will have teams be validated according to the new code.");
			} else if (target === 'punishments') {
				patch = 'punishments';
				if (lock['punishments']) {
					return this.errorReply(`Hot-patching punishments has been disabled by ${lock['punishments'].by} (${lock['punishments'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				global.Punishments = require('../punishments').Punishments;
				this.sendReply("Punishments have been hot-patched.");
			} else if (target === 'dnsbl' || target === 'datacenters' || target === 'iptools') {
				patch = 'dnsbl';
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				global.IPTools = require('../ip-tools').IPTools;
				void IPTools.loadHostsAndRanges();
				this.sendReply("IPTools has been hot-patched.");
			} else if (target === 'modlog') {
				patch = 'modlog';
				if (lock['modlog']) {
					return this.errorReply(`Hot-patching modlogs has been disabled by ${lock['modlog'].by} (${lock['modlog'].reason})`);
				}
				if (requiresForce(patch)) return this.errorReply(requiresForceMessage);

				const streams = Rooms.Modlog.streams;
				const sharedStreams = Rooms.Modlog.sharedStreams;

				const processManagers = ProcessManager.processManagers;
				for (const manager of processManagers.slice()) {
					if (manager.filename.startsWith(FS('.server-dist/modlog').path)) void manager.destroy();
				}

				Rooms.Modlog = require('../modlog').modlog;
				this.sendReply("Modlog has been hot-patched.");
				Rooms.Modlog.streams = streams;
				Rooms.Modlog.sharedStreams = sharedStreams;
				this.sendReply("Modlog streams have been re-initialized.");
			} else if (target.startsWith('disable')) {
				this.sendReply("Disabling hot-patch has been moved to its own command:");
				return this.parse('/help nohotpatch');
			} else {
				return this.errorReply("Your hot-patch command was unrecognized.");
			}
		} catch (e) {
			Rooms.global.notifyRooms(
				['development', 'staff', 'upperstaff'] as RoomID[],
				`|c|${user.getIdentity()}|/log ${user.name} used /hotpatch ${patch} - but something failed while trying to hot-patch.`
			);
			return this.errorReply(`Something failed while trying to hot-patch ${patch}: \n${e.stack}`);
		}
		Monitor.hotpatchVersions[patch] = version;
		Rooms.global.notifyRooms(
			['development', 'staff', 'upperstaff'] as RoomID[],
			`|c|${user.getIdentity()}|/log ${user.name} used /hotpatch ${patch}`
		);
	},
	hotpatchhelp: [
		`Hot-patching the game engine allows you to update parts of Showdown without interrupting currently-running battles. Requires: console access`,
		`Hot-patching has greater memory requirements than restarting`,
		`You can disable various hot-patches with /nohotpatch. For more information on this, see /help nohotpatch`,
		`/hotpatch chat - reloads the chat-commands and chat-plugins directories`,
		`/hotpatch validator - spawn new team validator processes`,
		`/hotpatch formats - reload the .sim-dist/dex.js tree, rebuild and rebroad the formats list, and spawn new simulator and team validator processes`,
		`/hotpatch dnsbl - reloads IPTools datacenters`,
		`/hotpatch punishments - reloads new punishments code`,
		`/hotpatch loginserver - reloads new loginserver code`,
		`/hotpatch tournaments - reloads new tournaments code`,
		`/hotpatch modlog - reloads new modlog code`,
		`/hotpatch all - hot-patches chat, tournaments, formats, login server, punishments, modlog, and dnsbl`,
		`/forcehotpatch [target] - as above, but performs the update regardless of whether the history has changed in git`,
	],

	hotpatchlock: 'nohotpatch',
	yeshotpatch: 'nohotpatch',
	allowhotpatch: 'nohotpatch',
	nohotpatch(target, room, user, connection, cmd) {
		if (!this.can('gdeclare')) return;
		if (!target) return this.parse('/help nohotpatch');

		const separator = ' ';

		const hotpatch = toID(target.substr(0, target.indexOf(separator)));
		const reason = target.substr(target.indexOf(separator), target.length).trim();
		if (!reason || !target.includes(separator)) return this.parse('/help nohotpatch');

		const lock = Monitor.hotpatchLock;
		const validDisable = ['chat', 'battles', 'formats', 'validator', 'tournaments', 'punishments', 'modlog', 'all'];

		if (!validDisable.includes(hotpatch)) {
			return this.errorReply(`Disabling hotpatching "${hotpatch}" is not supported.`);
		}
		const enable = ['allowhotpatch', 'yeshotpatch'].includes(cmd);

		if (enable) {
			if (!lock[hotpatch]) return this.errorReply(`Hot-patching ${hotpatch} is not disabled.`);

			delete lock[hotpatch];
			this.sendReply(`You have enabled hot-patching ${hotpatch}.`);
		} else {
			if (lock[hotpatch]) {
				return this.errorReply(`Hot-patching ${hotpatch} has already been disabled by ${lock[hotpatch].by} (${lock[hotpatch].reason})`);
			}
			lock[hotpatch] = {
				by: user.name,
				reason,
			};
			this.sendReply(`You have disabled hot-patching ${hotpatch}.`);
		}
		Rooms.global.notifyRooms(
			['development', 'staff', 'upperstaff'] as RoomID[],
			`|c|${user.getIdentity()}|/log ${user.name} has ${enable ? 'enabled' : 'disabled'} hot-patching ${hotpatch}. Reason: ${reason}`
		);
	},
	nohotpatchhelp: [
		`/nohotpatch [chat|formats|battles|validator|tournaments|punishments|modlog|all] [reason] - Disables hotpatching the specified part of the simulator. Requires: &`,
		`/allowhotpatch [chat|formats|battles|validator|tournaments|punishments|modlog|all] [reason] - Enables hotpatching the specified part of the simulator. Requires: &`,
	],

	processes(target, room, user) {
		if (!this.can('lockdown')) return false;

		let buf = `<strong>${process.pid}</strong> - Main<br />`;
		for (const manager of ProcessManager.processManagers) {
			for (const [i, process] of manager.processes.entries()) {
				buf += `<strong>${process.getProcess().pid}</strong> - ${manager.basename} ${i} (load ${process.load})<br />`;
			}
			for (const [i, process] of manager.releasingProcesses.entries()) {
				buf += `<strong>${process.getProcess().pid}</strong> - PENDING RELEASE ${manager.basename} ${i} (load ${process.load})<br />`;
			}
		}

		this.sendReplyBox(buf);
	},

	async savelearnsets(target, room, user, connection) {
		if (!this.canUseConsole()) return false;
		this.sendReply("saving...");
		await FS('data/learnsets.js').write(`'use strict';\n\nexports.Learnsets = {\n` +
			Object.entries(Dex.data.Learnsets).map(([id, entry]) => (
				`\t${id}: {learnset: {\n` +
				Object.entries(Dex.getLearnsetData(id as ID)).sort(
					(a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
				).map(([moveid, sources]) => (
					`\t\t${moveid}: ["` + sources.join(`", "`) + `"],\n`
				)).join('') +
				`\t}},\n`
			)).join('') +
		`};\n`);
		this.sendReply("learnsets.js saved.");
	},

	widendatacenters: 'adddatacenters',
	adddatacenters() {
		this.errorReply("This command has been replaced by /datacenter add");
		return this.parse('/help datacenters');
	},

	disableladder(target, room, user) {
		if (!this.can('disableladder')) return false;
		if (Ladders.disabled) {
			return this.errorReply(`/disableladder - Ladder is already disabled.`);
		}

		Ladders.disabled = true;

		this.modlog(`DISABLELADDER`);
		Monitor.log(`The ladder was disabled by ${user.name}.`);

		const innerHTML = (
			`<b>Due to technical difficulties, the ladder has been temporarily disabled.</b><br />` +
			`Rated games will no longer update the ladder. It will be back momentarily.`
		);

		for (const curRoom of Rooms.rooms.values()) {
			if (curRoom.type === 'battle') curRoom.rated = 0;
			curRoom.addRaw(`<div class="broadcast-red">${innerHTML}</div>`).update();
		}
		for (const u of Users.users.values()) {
			if (u.connected) u.send(`|pm|&|${u.group}${u.name}|/raw <div class="broadcast-red">${innerHTML}</div>`);
		}
	},

	enableladder(target, room, user) {
		if (!this.can('disableladder')) return false;
		if (!Ladders.disabled) {
			return this.errorReply(`/enable - Ladder is already enabled.`);
		}
		Ladders.disabled = false;

		this.modlog('ENABLELADDER');
		Monitor.log(`The ladder was enabled by ${user.name}.`);

		const innerHTML = (
			`<b>The ladder is now back.</b><br />` +
			`Rated games will update the ladder now..`
		);

		for (const curRoom of Rooms.rooms.values()) {
			curRoom.addRaw(`<div class="broadcast-green">${innerHTML}</div>`).update();
		}
		for (const u of Users.users.values()) {
			if (u.connected) u.send(`|pm|&|${u.group}${u.name}|/raw <div class="broadcast-green">${innerHTML}</div>`);
		}
	},

	lockdown(target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.startLockdown();

		this.stafflog(`${user.name} used /lockdown`);
	},
	lockdownhelp: [
		`/lockdown - locks down the server, which prevents new battles from starting so that the server can eventually be restarted. Requires: &`,
	],

	autolockdown: 'autolockdownkill',
	autolockdownkill(target, room, user) {
		if (!this.can('lockdown')) return false;
		if (Config.autolockdown === undefined) Config.autolockdown = true;
		if (this.meansYes(target)) {
			if (Config.autolockdown) {
				return this.errorReply("The server is already set to automatically kill itself upon the final battle finishing.");
			}
			Config.autolockdown = true;
			this.privateGlobalModAction(`${user.name} used /autolockdownkill on (autokill on final battle finishing)`);
		} else if (this.meansNo(target)) {
			if (!Config.autolockdown) {
				return this.errorReply("The server is already set to not automatically kill itself upon the final battle finishing.");
			}
			Config.autolockdown = false;
			this.privateGlobalModAction(`${user.name} used /autolockdownkill off (no autokill on final battle finishing)`);
		} else {
			return this.parse('/help autolockdownkill');
		}
	},
	autolockdownkillhelp: [
		`/autolockdownkill on - Turns on the setting to enable the server to automatically kill itself upon the final battle finishing. Requires &`,
		`/autolockdownkill off - Turns off the setting to enable the server to automatically kill itself upon the final battle finishing. Requires &`,
	],

	prelockdown(target, room, user) {
		if (!this.can('lockdown')) return false;
		Rooms.global.lockdown = 'pre';

		this.privateGlobalModAction(`${user.name} used /prelockdown (disabled tournaments in preparation for server restart)`);
	},

	slowlockdown(target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.startLockdown(undefined, true);

		this.privateGlobalModAction(`${user.name} used /slowlockdown (lockdown without auto-restart)`);
	},

	crashfixed: 'endlockdown',
	endlockdown(target, room, user, connection, cmd) {
		if (!this.can('lockdown')) return false;

		if (!Rooms.global.lockdown) {
			return this.errorReply("We're not under lockdown right now.");
		}
		if (Rooms.global.lockdown !== true && cmd === 'crashfixed') {
			return this.errorReply('/crashfixed - There is no active crash.');
		}

		const message = cmd === 'crashfixed' ?
			`<div class="broadcast-green"><b>We fixed the crash without restarting the server!</b></div>` :
			`<div class="broadcast-green"><b>The server restart was canceled.</b></div>`;
		if (Rooms.global.lockdown === true) {
			for (const curRoom of Rooms.rooms.values()) {
				curRoom.addRaw(message).update();
			}
			for (const curUser of Users.users.values()) {
				curUser.send(`|pm|&|${curUser.group}${curUser.name}|/raw ${message}`);
			}
		} else {
			this.sendReply("Preparation for the server shutdown was canceled.");
		}
		Rooms.global.lockdown = false;

		this.stafflog(`${user.name} used /endlockdown`);
	},
	endlockdownhelp: [
		`/endlockdown - Cancels the server restart and takes the server out of lockdown state. Requires: &`,
		`/crashfixed - Ends the active lockdown caused by a crash without the need of a restart. Requires: &`,
	],

	emergency(target, room, user) {
		if (!this.can('lockdown')) return false;

		if (Config.emergency) {
			return this.errorReply("We're already in emergency mode.");
		}
		Config.emergency = true;
		for (const curRoom of Rooms.rooms.values()) {
			curRoom.addRaw(`<div class="broadcast-red">The server has entered emergency mode. Some features might be disabled or limited.</div>`).update();
		}

		this.stafflog(`${user.name} used /emergency.`);
	},

	endemergency(target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Config.emergency) {
			return this.errorReply("We're not in emergency mode.");
		}
		Config.emergency = false;
		for (const curRoom of Rooms.rooms.values()) {
			curRoom.addRaw(`<div class="broadcast-green"><b>The server is no longer in emergency mode.</b></div>`).update();
		}

		this.stafflog(`${user.name} used /endemergency.`);
	},

	kill(target, room, user) {
		if (!this.can('lockdown')) return false;

		if (Rooms.global.lockdown !== true) {
			return this.errorReply("For safety reasons, /kill can only be used during lockdown.");
		}

		if (Monitor.updateServerLock) {
			return this.errorReply("Wait for /updateserver to finish before using /kill.");
		}

		const logRoom = Rooms.get('staff') || Rooms.lobby || room;

		if (!logRoom?.log.roomlogStream) return process.exit();

		logRoom.roomlog(`${user.name} used /kill`);

		void logRoom.log.roomlogStream.writeEnd().then(() => {
			process.exit();
		});

		// In the case the above never terminates
		setTimeout(() => {
			process.exit();
		}, 10000);
	},
	killhelp: [`/kill - kills the server. Can't be done unless the server is in lockdown state. Requires: &`],

	loadbanlist(target, room, user, connection) {
		if (!this.can('lockdown')) return false;

		connection.sendTo(room, "Loading ipbans.txt...");
		Punishments.loadBanlist().then(
			() => connection.sendTo(room, "ipbans.txt has been reloaded."),
			error => connection.sendTo(room, `Something went wrong while loading ipbans.txt: ${error}`)
		);
	},
	loadbanlisthelp: [
		`/loadbanlist - Loads the bans located at ipbans.txt. The command is executed automatically at startup. Requires: &`,
	],

	hideprevid(target, room, user, connection) {
		if (user.group !== '~') return false;
		let targetUser = this.targetUserOrSelf(target, false);
		if (!targetUser) {
			return this.errorReply("User " + this.targetUsername + " not found.");
		}
		let prevNames = Object.keys(targetUser.prevNames).join(", ");
		targetUser.clearPrev();
		return this.sendReply(`Hided previous names: ${prevNames}`);
	},

	pschinascore(target, room, user) {
		if (!room.settings.staffRoom) {
			this.sendReply("在staff room更新ps国服积分");
			return false;
		}
		if (!this.can('show')) return false;
		let username = target.split(',')[0];
		let score = target.split(',')[1];
		let reason = target.split(',')[2];
		if (!username || !score || !reason || username.length === 0 || score.length === 0 || reason.length === 0) {
			return this.parse("/pschinascorehelp");
		}
		if (isNaN(parseInt(score))) {
			return this.parse("/pschinascorehelp");
		}
		Ladders("gen8ps").updateScore(username, score, reason);
		this.globalModlog(`'PS国服积分`, username, `积分:${score}, 原因:${reason}, 操作人:${user.name}.`);
		this.addModAction(`用户ID: ${username}, 增加PS国服积分:${score}, 原因:${reason}, 操作人:${user.name}.`);
		// this.addModAction(`'PS国服积分 用户名:${username}, 积分:${score}, 原因:${reason}, 操作人:${user.name}.`);
	},

	pschinascorehelp: [
		`/pschinascore user,score,reason - 给user用户的国服积分增加score分，说明原因. Requires: & ~`,
	],
	async savereplocal(target, room, user){
		if (!room.battle) {
			return this.errorReply(`This command only works in battle rooms.`);
		}
		let player1 = room.battle.p1.id;
		let player2 = room.battle.p2.id;
		let userid = toID(user);
		if (!user.isSysop && userid!==player1 && userid!==player2) return false;
		this.sendReply("authorized");
		const logdata = room.battle;
		this.sendReply(String(logdata));
		if(!logdata)
			return false;
		const log = logdata.log;
		const rep_head = `<!DOCTYPE html>
		<meta charset="utf-8" />
		<!-- version 1 -->
		<title>Replay</title>
		<style>
		html,body {font-family:Verdana, sans-serif;font-size:10pt;margin:0;padding:0;}body{padding:12px 0;} .battle-log {font-family:Verdana, sans-serif;font-size:10pt;} .battle-log-inline {border:1px solid #AAAAAA;background:#EEF2F5;color:black;max-width:640px;margin:0 auto 80px;padding-bottom:5px;} .battle-log .inner {padding:4px 8px 0px 8px;} .battle-log .inner-preempt {padding:0 8px 4px 8px;} .battle-log .inner-after {margin-top:0.5em;} .battle-log h2 {margin:0.5em -8px;padding:4px 8px;border:1px solid #AAAAAA;background:#E0E7EA;border-left:0;border-right:0;font-family:Verdana, sans-serif;font-size:13pt;} .battle-log .chat {vertical-align:middle;padding:3px 0 3px 0;font-size:8pt;} .battle-log .chat strong {color:#40576A;} .battle-log .chat em {padding:1px 4px 1px 3px;color:#000000;font-style:normal;} .chat.mine {background:rgba(0,0,0,0.05);margin-left:-8px;margin-right:-8px;padding-left:8px;padding-right:8px;} .spoiler {color:#BBBBBB;background:#BBBBBB;padding:0px 3px;} .spoiler:hover, .spoiler:active, .spoiler-shown {color:#000000;background:#E2E2E2;padding:0px 3px;} .spoiler a {color:#BBBBBB;} .spoiler:hover a, .spoiler:active a, .spoiler-shown a {color:#2288CC;} .chat code, .chat .spoiler:hover code, .chat .spoiler:active code, .chat .spoiler-shown code {border:1px solid #C0C0C0;background:#EEEEEE;color:black;padding:0 2px;} .chat .spoiler code {border:1px solid #CCCCCC;background:#CCCCCC;color:#CCCCCC;} .battle-log .rated {padding:3px 4px;} .battle-log .rated strong {color:white;background:#89A;padding:1px 4px;border-radius:4px;} .spacer {margin-top:0.5em;} .message-announce {background:#6688AA;color:white;padding:1px 4px 2px;} .message-announce a, .broadcast-green a, .broadcast-blue a, .broadcast-red a {color:#DDEEFF;} .broadcast-green {background-color:#559955;color:white;padding:2px 4px;} .broadcast-blue {background-color:#6688AA;color:white;padding:2px 4px;} .infobox {border:1px solid #6688AA;padding:2px 4px;} .infobox-limited {max-height:200px;overflow:auto;overflow-x:hidden;} .broadcast-red {background-color:#AA5544;color:white;padding:2px 4px;} .message-learn-canlearn {font-weight:bold;color:#228822;text-decoration:underline;} .message-learn-cannotlearn {font-weight:bold;color:#CC2222;text-decoration:underline;} .message-effect-weak {font-weight:bold;color:#CC2222;} .message-effect-resist {font-weight:bold;color:#6688AA;} .message-effect-immune {font-weight:bold;color:#666666;} .message-learn-list {margin-top:0;margin-bottom:0;} .message-throttle-notice, .message-error {color:#992222;} .message-overflow, .chat small.message-overflow {font-size:0pt;} .message-overflow::before {font-size:9pt;content:'...';} .subtle {color:#3A4A66;}
		</style>
		<div class="wrapper replay-wrapper" style="max-width:1180px;margin:0 auto">
		<input type="hidden" name="replayid" value="china-gen7randomformats-256935" />
		<div class="battle"></div><div class="battle-log"></div><div class="replay-controls"></div><div class="replay-controls-2"></div>

		<script type="text/plain" class="battle-log-data">`;
		const rep_tail = `</script>
		</div>
		</div>
		</div>
		<script>
		let daily = Math.floor(Date.now()/1000/60/60/24);document.write('<script src="https://play.pokemonshowdown.com/js/replay-embed.js?version'+daily+'"></'+'script>');
		</script>
		`;

		let html = rep_head;
		for (const logitem of log) {
			html = html + logitem + '\n';
		}
		html += rep_tail;

		await FS(`config/avatars/static/${room.battle.gameid}.html`).write(html);
		this.sendReply(`http://47.94.147.145:8000/avatars/static/${room.battle.gameid}.html`);

	},
	async restorereplay(target, room, user) {
		if ((!this.user.isSysop)&&!this.can('lockdown')) return false;
		let params = target.split(',');
		let p1 = params[0];
		let p2 = params[1];
		let format = params[2];
		let date = params[3];
		if (!p1 || !p2 || !format || ! date) return false;
		if (!this.user.isSysop) {
			this.globalModlog('REPLAYRESTORE', `${p1}, ${p2}, ${format}, ${date}`, `By ${user.name}.`);
			// this.addModAction(`REPLAYRESTORE on ${p1}, ${p2}, ${format}, ${date} by ${user.name}.`);
		   // console.log("restore command used by ", this.user.name, "on users:", p1,p2,format,date, " at time: ", Chat.toTimestamp(new Date()));
		}
		let dir = `logs/${date.substr(0, 7)}/${format}/${date}`;

		let files = [];
		try {
			files = await FS(dir).readdir();
		} catch (err) {
			if (err.code === 'ENOENT') {
				this.sendReply("Replay Not Found");
				return false;
			}
			throw err;
		}
		this.sendReply(String(files.length));
		for (const file of files) {
			const json = await FS(`${dir}/${file}`).readIfExists();
			const data = JSON.parse(json);
			let find = false;
			if (toID(data.p1) === p1 && toID(data.p2) === p2) find=true;
			if (toID(data.p1) === p2 && toID(data.p2) === p1) find=true;

			if (!find) continue;
			let log = data.log;
			const rep_head = `<!DOCTYPE html>
			<meta charset="utf-8" />
			<!-- version 1 -->
			<title>Replay</title>
			<style>
			html,body {font-family:Verdana, sans-serif;font-size:10pt;margin:0;padding:0;}body{padding:12px 0;} .battle-log {font-family:Verdana, sans-serif;font-size:10pt;} .battle-log-inline {border:1px solid #AAAAAA;background:#EEF2F5;color:black;max-width:640px;margin:0 auto 80px;padding-bottom:5px;} .battle-log .inner {padding:4px 8px 0px 8px;} .battle-log .inner-preempt {padding:0 8px 4px 8px;} .battle-log .inner-after {margin-top:0.5em;} .battle-log h2 {margin:0.5em -8px;padding:4px 8px;border:1px solid #AAAAAA;background:#E0E7EA;border-left:0;border-right:0;font-family:Verdana, sans-serif;font-size:13pt;} .battle-log .chat {vertical-align:middle;padding:3px 0 3px 0;font-size:8pt;} .battle-log .chat strong {color:#40576A;} .battle-log .chat em {padding:1px 4px 1px 3px;color:#000000;font-style:normal;} .chat.mine {background:rgba(0,0,0,0.05);margin-left:-8px;margin-right:-8px;padding-left:8px;padding-right:8px;} .spoiler {color:#BBBBBB;background:#BBBBBB;padding:0px 3px;} .spoiler:hover, .spoiler:active, .spoiler-shown {color:#000000;background:#E2E2E2;padding:0px 3px;} .spoiler a {color:#BBBBBB;} .spoiler:hover a, .spoiler:active a, .spoiler-shown a {color:#2288CC;} .chat code, .chat .spoiler:hover code, .chat .spoiler:active code, .chat .spoiler-shown code {border:1px solid #C0C0C0;background:#EEEEEE;color:black;padding:0 2px;} .chat .spoiler code {border:1px solid #CCCCCC;background:#CCCCCC;color:#CCCCCC;} .battle-log .rated {padding:3px 4px;} .battle-log .rated strong {color:white;background:#89A;padding:1px 4px;border-radius:4px;} .spacer {margin-top:0.5em;} .message-announce {background:#6688AA;color:white;padding:1px 4px 2px;} .message-announce a, .broadcast-green a, .broadcast-blue a, .broadcast-red a {color:#DDEEFF;} .broadcast-green {background-color:#559955;color:white;padding:2px 4px;} .broadcast-blue {background-color:#6688AA;color:white;padding:2px 4px;} .infobox {border:1px solid #6688AA;padding:2px 4px;} .infobox-limited {max-height:200px;overflow:auto;overflow-x:hidden;} .broadcast-red {background-color:#AA5544;color:white;padding:2px 4px;} .message-learn-canlearn {font-weight:bold;color:#228822;text-decoration:underline;} .message-learn-cannotlearn {font-weight:bold;color:#CC2222;text-decoration:underline;} .message-effect-weak {font-weight:bold;color:#CC2222;} .message-effect-resist {font-weight:bold;color:#6688AA;} .message-effect-immune {font-weight:bold;color:#666666;} .message-learn-list {margin-top:0;margin-bottom:0;} .message-throttle-notice, .message-error {color:#992222;} .message-overflow, .chat small.message-overflow {font-size:0pt;} .message-overflow::before {font-size:9pt;content:'...';} .subtle {color:#3A4A66;}
			</style>
			<div class="wrapper replay-wrapper" style="max-width:1180px;margin:0 auto">
			<input type="hidden" name="replayid" value="china-gen7randomformats-256935" />
			<div class="battle"></div><div class="battle-log"></div><div class="replay-controls"></div><div class="replay-controls-2"></div>

			<script type="text/plain" class="battle-log-data">`;
			const rep_tail = `</script>
			</div>
			</div>
			</div>
			<script>
			let daily = Math.floor(Date.now()/1000/60/60/24);document.write('<script src="https://play.pokemonshowdown.com/js/replay-embed.js?version'+daily+'"></'+'script>');
			</script>
			`;

			let html = rep_head;
			for (const logitem of log) {
				html = html + logitem + '\n';
			}
			html += rep_tail;
			const htmlname = file.replace(".log.json",".html");
			await FS(`config/avatars/static/${htmlname}`).write(html);
			this.sendReply(`http://47.94.147.145:8000/avatars/static/${htmlname}`);
		}
	},

	refreshpage(target, room, user) {
		if (!this.can('lockdown')) return false;
		Rooms.global.sendAll('|refresh|');
		this.stafflog(`${user.name} used /refreshpage`);
	},

	async updateserver(target, room, user, connection) {
		if (!this.canUseConsole()) return false;
		const isPrivate = toID(target) === 'private';
		if (Monitor.updateServerLock) {
			return this.errorReply(`/updateserver - Another update is already in progress (or a previous update crashed).`);
		}

		Monitor.updateServerLock = true;

		const exec = (command: string): Promise<[number, string, string]> => {
			this.stafflog(`$ ${command}`);
			return new Promise((resolve, reject) => {
				child_process.exec(command, {
					cwd: `${__dirname}/../../${isPrivate ? Config.privatecodepath || '../main-private/' : ``}`,
				}, (error, stdout, stderr) => {
					let log = `[o] ${stdout}[e] ${stderr}`;
					if (error) log = `[c] ${error.code}\n${log}`;
					this.stafflog(log);
					resolve([error?.code || 0, stdout, stderr]);
				});
			});
		};

		this.sendReply(`Fetching newest version...`);
		this.addGlobalModAction(`${user.name} used /updateserver ${isPrivate ? `private` : `public`}`);

		let [code, stdout, stderr] = await exec(`git fetch`);
		if (code) throw new Error(`updateserver: Crash while fetching - make sure this is a Git repository`);
		if (!isPrivate && !stdout && !stderr) {
			this.sendReply(`There were no updates.`);
			[code, stdout, stderr] = await exec('node ./build');
			if (stderr) {
				return this.errorReply(`Crash while rebuilding: ${stderr}`);
			}
			this.sendReply(`Rebuilt.`);
			Monitor.updateServerLock = false;
			return;
		}

		[code, stdout, stderr] = await exec(`git rev-parse HEAD`);
		if (code || stderr) throw new Error(`updateserver: Crash while grabbing hash`);
		const oldHash = String(stdout).trim();

		[code, stdout, stderr] = await exec(`git stash save --include-untracked "PS /updateserver autostash"`);
		let stashedChanges = true;
		if (code) throw new Error(`updateserver: Crash while stashing`);
		if ((stdout + stderr).includes("No local changes")) {
			stashedChanges = false;
		} else if (stderr) {
			throw new Error(`updateserver: Crash while stashing`);
		} else {
			this.sendReply(`Saving changes...`);
		}

		// errors can occur while rebasing or popping the stash; make sure to recover
		try {
			this.sendReply(`Rebasing...`);
			[code] = await exec(`git rebase FETCH_HEAD`);
			if (code) {
				// conflict while rebasing
				await exec(`git rebase --abort`);
				throw new Error(`restore`);
			}

			if (stashedChanges) {
				this.sendReply(`Restoring saved changes...`);
				[code] = await exec(`git stash pop`);
				if (code) {
					// conflict while popping stash
					await exec(`git reset HEAD .`);
					await exec(`git checkout .`);
					throw new Error(`restore`);
				}
			}

			this.sendReply(`SUCCESSFUL, server updated.`);
		} catch (e) {
			// failed while rebasing or popping the stash
			await exec(`git reset --hard ${oldHash}`);
			await exec(`git stash pop`);
			this.sendReply(`FAILED, old changes restored.`);
		}
		if (!isPrivate) {
			[code, stdout, stderr] = await exec('node ./build');
			if (stderr) {
				return this.errorReply(`Crash while rebuilding: ${stderr}`);
			}
			this.sendReply(`Rebuilt.`);
		}
		Monitor.updateServerLock = false;
	},

	async rebuild(target, room, user, connection) {
		const exec = (command: string): Promise<[number, string, string]> => {
			this.stafflog(`$ ${command}`);
			return new Promise((resolve, reject) => {
				child_process.exec(command, {
					cwd: __dirname,
				}, (error, stdout, stderr) => {
					let log = `[o] ${stdout}[e] ${stderr}`;
					if (error) log = `[c] ${error.code}\n${log}`;
					this.stafflog(log);
					resolve([error?.code || 0, stdout, stderr]);
				});
			});
		};

		if (!this.canUseConsole()) return false;
		Monitor.updateServerLock = true;
		const [, , stderr] = await exec('node ../../build');
		if (stderr) {
			return this.errorReply(`Crash while rebuilding: ${stderr}`);
		}
		Monitor.updateServerLock = false;
		this.sendReply(`Rebuilt.`);
	},

	/*********************************************************
	 * Low-level administration commands
	 *********************************************************/

	bash(target, room, user, connection) {
		if (!this.canUseConsole()) return false;
		if (!target) return this.parse('/help bash');

		connection.sendTo(room, `$ ${target}`);
		child_process.exec(target, (error, stdout, stderr) => {
			connection.sendTo(room, (`${stdout}${stderr}`));
		});
	},
	bashhelp: [`/bash [command] - Executes a bash command on the server. Requires: & console access`],

	async eval(target, room, user, connection) {
		if (!room) return this.requiresRoom();
		if (!this.canUseConsole()) return false;
		if (!this.runBroadcast(true)) return;
		const logRoom = Rooms.get('upperstaff') || Rooms.get('staff');

		if (this.message.startsWith('>>') && room) {
			this.broadcasting = true;
			this.broadcastToRoom = true;
		}
		this.sendReply(`|html|<table border="0" cellspacing="0" cellpadding="0"><tr><td valign="top">&gt;&gt;&nbsp;</td><td>${Chat.getReadmoreCodeBlock(target)}</td></tr><table>`);
		logRoom?.roomlog(`>> ${target}`);
		try {
			/* eslint-disable no-eval, @typescript-eslint/no-unused-vars */
			const battle = room.battle;
			const me = user;
			let result = eval(target);
			/* eslint-enable no-eval, @typescript-eslint/no-unused-vars */

			if (result?.then) {
				result = `Promise -> ${Utils.visualize(await result)}`;
			} else {
				result = Utils.visualize(result);
			}
			this.sendReply(`|html|<table border="0" cellspacing="0" cellpadding="0"><tr><td valign="top">&lt;&lt;&nbsp;</td><td>${Chat.getReadmoreCodeBlock(result)}</td></tr><table>`);
			logRoom?.roomlog(`<< ${result}`);
		} catch (e) {
			const message = ('' + e.stack).replace(/\n *at CommandContext\.eval [\s\S]*/m, '');
			this.sendReply(`|html|<table border="0" cellspacing="0" cellpadding="0"><tr><td valign="top">&lt;&lt;&nbsp;</td><td>${Chat.getReadmoreCodeBlock(message)}</td></tr><table>`);
			logRoom?.roomlog(`<< ${message}`);
		}
	},

	evalbattle(target, room, user, connection) {
		if (!room) return this.requiresRoom();
		if (!this.canUseConsole()) return false;
		if (!this.runBroadcast(true)) return;
		if (!room.battle) {
			return this.errorReply("/evalbattle - This isn't a battle room.");
		}

		void room.battle.stream.write(`>eval ${target.replace(/\n/g, '\f')}`);
	},

	ebat: 'editbattle',
	editbattle(target, room, user) {
		if (!room) return this.requiresRoom();
		if (!this.can('forcewin')) return false;
		if (!target) return this.parse('/help editbattle');
		if (!room.battle) {
			this.errorReply("/editbattle - This is not a battle room.");
			return false;
		}
		const battle = room.battle;
		let cmd;
		const spaceIndex = target.indexOf(' ');
		if (spaceIndex > 0) {
			cmd = target.substr(0, spaceIndex).toLowerCase();
			target = target.substr(spaceIndex + 1);
		} else {
			cmd = target.toLowerCase();
			target = '';
		}
		if (cmd.charAt(cmd.length - 1) === ',') cmd = cmd.slice(0, -1);
		const targets = target.split(',');
		function getPlayer(input: string) {
			const player = battle.playerTable[toID(input)];
			if (player) return player.slot;
			if (input.includes('1')) return 'p1';
			if (input.includes('2')) return 'p2';
			return 'p3';
		}
		function getPokemon(input: string) {
			if (/^[0-9]+$/.test(input.trim())) {
				return `.pokemon[${(parseInt(input) - 1)}]`;
			}
			return `.pokemon.find(p => p.baseSpecies.id==='${toID(input)}' || p.species.id==='${toID(input)}')`;
		}
		switch (cmd) {
		case 'hp':
		case 'h':
			if (targets.length !== 3) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(
				`>eval let p=${getPlayer(targets[0]) + getPokemon(targets[1])};p.sethp(${parseInt(targets[2])});if (p.isActive)battle.add('-damage',p,p.getHealth);`
			);
			break;
		case 'status':
		case 's':
			if (targets.length !== 3) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(
				`>eval let pl=${getPlayer(targets[0])};let p=pl${getPokemon(targets[1])};p.setStatus('${toID(targets[2])}');if (!p.isActive){battle.add('','please ignore the above');battle.add('-status',pl.active[0],pl.active[0].status,'[silent]');}`
			);
			break;
		case 'pp':
			if (targets.length !== 4) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(
				`>eval let pl=${getPlayer(targets[0])};let p=pl${getPokemon(targets[1])};p.getMoveData('${toID(targets[2])}').pp = ${parseInt(targets[3])};`
			);
			break;
		case 'boost':
		case 'b':
			if (targets.length !== 4) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(
				`>eval let p=${getPlayer(targets[0]) + getPokemon(targets[1])};battle.boost({${toID(targets[2])}:${parseInt(targets[3])}},p)`
			);
			break;
		case 'volatile':
		case 'v':
			if (targets.length !== 3) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(
				`>eval let p=${getPlayer(targets[0]) + getPokemon(targets[1])};p.addVolatile('${toID(targets[2])}')`
			);
			break;
		case 'sidecondition':
		case 'sc':
			if (targets.length !== 2) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(`>eval let p=${getPlayer(targets[0])}.addSideCondition('${toID(targets[1])}', 'debug')`);
			break;
		case 'fieldcondition': case 'pseudoweather':
		case 'fc':
			if (targets.length !== 1) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(`>eval battle.field.addPseudoWeather('${toID(targets[0])}', 'debug')`);
			break;
		case 'weather':
		case 'w':
			if (targets.length !== 1) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(`>eval battle.field.setWeather('${toID(targets[0])}', 'debug')`);
			break;
		case 'terrain':
		case 't':
			if (targets.length !== 1) {
				this.errorReply("Incorrect command use");
				return this.parse('/help editbattle');
			}
			void battle.stream.write(`>eval battle.field.setTerrain('${toID(targets[0])}', 'debug')`);
			break;
		default:
			this.errorReply(`Unknown editbattle command: ${cmd}`);
			return this.parse('/help editbattle');
		}
	},
	editbattlehelp: [
		`/editbattle hp [player], [pokemon], [hp]`,
		`/editbattle status [player], [pokemon], [status]`,
		`/editbattle pp [player], [pokemon], [move], [pp]`,
		`/editbattle boost [player], [pokemon], [stat], [amount]`,
		`/editbattle volatile [player], [pokemon], [volatile]`,
		`/editbattle sidecondition [player], [sidecondition]`,
		`/editbattle fieldcondition [fieldcondition]`,
		`/editbattle weather [weather]`,
		`/editbattle terrain [terrain]`,
		`Short forms: /ebat h OR s OR pp OR b OR v OR sc OR fc OR w OR t`,
		`[player] must be a username or number, [pokemon] must be species name or party slot number (not nickname), [move] must be move name.`,
	],
};

export const pages: PageTable = {
	bot(args, user, connection) {
		const [botid, pageid] = args;
		const bot = Users.get(botid);
		if (!bot) {
			return `<div class="pad"><h2>The bot "${bot}" is not available.</h2></div>`;
		}
		let canSend = Users.globalAuth.get(bot) === '*';
		let room;
		for (const curRoom of Rooms.global.chatRooms) {
			if (curRoom.auth.getDirect(bot.id) === '*') {
				canSend = true;
				room = curRoom;
			}
		}
		if (!canSend) {
			return `<div class="pad"><h2>"${bot}" is not a bot.</h2></div>`;
		}
		connection.lastRequestedPage = `${bot.id}-${pageid}`;
		bot.sendTo(
			room ? room.roomid : 'lobby',
			`|pm|${user.getIdentity()}|${bot.getIdentity()}||requestpage|${user.name}|${pageid}`
		);
	},
};
