const Discord = require('discord.js');
const bot = new Discord.Client();
var logger = require('winston');
//var emoji = require('node-emoji')
var emoji = require('./node-emoji_copy/index.js')
var fs = require('fs');

var ThisIsTestBot = true;

if(ThisIsTestBot)
	var config = require('./configTest');
else
	var config = require('./config');


//Knex
var knex = require('knex')(config.db);

//technical
var LastMessageId = 0;
var GotLastId = false;
var LastGameStartedReported = 0;
var LastGameStatus = 0;
var LastGameFisnishedReported = 0;
var LobbyReady = false;
var PreviousPlayersList = [];
var CurrentPlayersAmountInLobby = 0;
var LastTimeGameLoadingReported = 0;

var UsersIDs = []; 		//IDs of users that wrote in 'sugestions' channel
var UsersTimes = [];	//When that happend (above)

var Players = [ ];
var Actions = []; //Queue of message to delete/edit/reaction_add
var ActionsWaitTime = 1500; //Time to wait between actions (milliseconds)
var BotReady = false; //This turns true when we are connected

//Messages to reply
//Read responces from files
var responces = require('./responces/otherResponces.js');
var HelpMessage = "";
fs.readFile('./responces/helpResponce.txt', 'utf8', function(err, data) { HelpMessage = data; });
//setTimeout(function(){ console.log(HelpMessage); }, 500);

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.add(logger.transports.File, { filename: "running.log" });
//logger.level = 'debug';
// Turn on debugs on default logger console transport
logger.default.transports.console.level='debug';
// Turn on debugs on default logger file transport
logger.default.transports.file.level='debug';
logger.exitOnError = false;

// Initialize Discord Bot
bot.on('ready', () => {
  logger.info(`Logged in as ${bot.user.tag}!`);
  BotReady = true;
});

// Send Message to the bot Procedure
function sendMessage( channel, message )
{
	//bot.channels.get(config.channels.ingamelobbychannel).sendMessage("Test string");
	if(BotReady && message.length > 0)
		bot.channels.get(channel).send(message);
}

// Delete the message Procedure
function deleteMessage( channel, messageID )
{
	
}

// Log connection errors
bot.on('error', function(message) {
    logger.warn('----- Error: ', message);
});

// Login
bot.login(config.token);

////////////////////////////////////////////////////////////////////
//=====

//Read Chatlog Messages
function print_messages( callback ) {

	  var LimitHere = 1;
	  if(LastMessageId > 0)
		  LimitHere = config.MessageLimitRows;
	  
	  knex('chatlog')
	  .select('id', 'name', 'message', 'server')
		.where({ target: 'LOBBY',
		 gamestatus:  '0',
		 gameFinished:  '0' })
		.andWhere('id', '>', LastMessageId)
		.orderBy('id', 'desc')
		.limit(LimitHere)
	  .then(function (a) { 
		 var messageHere = ""
		 var n = 0;
		 //reverse array
		 a.reverse();
		 a.forEach(function(row){
					//console.log(row);
					if(n != 0 )
						messageHere += "\n";
					messageHere += "**"+row["name"]+":** "+row["message"];
					LastMessageId = row["id"];
					//logger.info(messageHere);
					//logger.info(row);
					
					//count messages of this player
					var plId = findPlayerInPlayers(Players, row["name"], row["server"]);
					if(plId >= 0)
						Players[plId][13] ++;
					n++;
		});
		 
		 if(GotLastId)
			//sendMessage({ to: dbInfo.ingamelobbychannel, message: messageHere });
			sendMessage(config.channels.ingamelobbychannel, messageHere);
		 else if(LastMessageId > 0)
		 {
			GotLastId = true;
			logger.info('LastId is set to: '+LastMessageId);
		 }
	  });
	
	//logger.info('Check!');
			
}

//find player function in PlayerList
function findPlayer(serachInThisArray, name, server)
{
	for(z=0;z<serachInThisArray.length; z++)
	{
		if(serachInThisArray[z][1] == name && serachInThisArray[z][6] == server)
		{
			return true;
			break;
		}
		//console.log(serachInThisArray[z][1]+" == "+name+" AND "+serachInThisArray[z][6]+" == "+server);
	}
	
	return false;
}

//Find Player in Players[] array
function findPlayerInPlayers(IncArray, name, server)
{
	for(z=0;z<IncArray.length; z++)
	{
		if(IncArray[z][0] == name && IncArray[z][1] == server)
		{
			return z;
			break;
		}
	}
	
	return -1;
}

//Report Game Start
function reportGameStart(playerListArray)
{
	if(config.ReportJoinLeaveStartPlayers)
	{
		if(Date.now() - LastTimeGameLoadingReported >= config.ReportedSafeTime*1000)
		{
			var playerlistStrng = "";
			for(i=0;i<playerListArray.length;i++)
			{
				playerlistStrng += playerListArray[i][1]+", ";
			}
			playerlistStrng = playerlistStrng.slice(0, playerlistStrng.length-2); //remove ', ' in the end
			//sendMessage({ to: dbInfo.ingamelobbychannel, message: '__<FBot> Game started with '+(playerListArray.length)+' players: '+playerlistStrng+'.__' });
			sendMessage(config.channels.ingamelobbychannel, '__<FBot> Game started with '+(playerListArray.length)+' players: '+playerlistStrng+'.__' );
		}
		LastTimeGameLoadingReported = Date.now();
	}
	else
		return false;
}

//Shorten the server name
function serverShort( server )
{
	if(server=="europe.battle.net")
		return "europe";
	else if(server=="asia.battle.net")
		return "asia";
	else if(server=="useast.battle.net")
		return "useast";
	else if(server=="uswest.battle.net")
		return "uswest";
	else if(server=="server.eurobattle.net")
		return "eurobattle";
	else
		return '';
}

//Check wwt_current_games
function check_current_lobby_game( callback ) {

	  
	  knex('wwt_current_games')
	  .select('id', 'status', 'gamename', 'players_list', 'players')
		.where('id', '>=', LastGameStartedReported)
		.orderBy('id', 'desc')
		.limit(1)
	  .then(function (result) { 
			//result[0] = {id: 0, status:0, etc}
			//LastGameStartedReported = 0;
			//LastGameStatus = 0
			//StatusChangeSent = false;
			
			//console.log(result);
			if(result.length > 0)
			{
				
				//Report joining/leaving players
				if(config.ReportJoinLeaveStartPlayers)
				{
					var PlayersList = [ ];
					//In the DB this field is a very long string where values are separated by tabs, length is 73 values per player (see ghost.sql example)
					var PlayersListResult = result[0]['players_list'].split("	");
					
					//Break Player List into array
					var c,i,j,temparray,chunk = 73;
					for (i=0,j=PlayersListResult.length; i<j; i+=chunk) {
						
						if(PlayersListResult.slice(i,i+chunk).length > 1)
							PlayersList.push(PlayersListResult.slice(i,i+chunk));
					}
					
					//Report new players in the list (Joining)
					for(i=0; i<PlayersList.length; i++)
					{
						if(! findPlayer(PreviousPlayersList, PlayersList[i][1], PlayersList[i][6]) )
						{
							if(PlayersList[i][19]>0)	//Player '+PlayersList[i][1]+'@'+PlayersList[i][6]+' joined
								//sendMessage({ to: dbInfo.ingamelobbychannel, message: '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! Games: '+PlayersList[i][19]+', ww: '+PlayersList[i][23]+'/'+PlayersList[i][21]+', vill: '+PlayersList[i][22]+'/'+PlayersList[i][20]+'. Elo: '+Math.round(PlayersList[i][26])+', Rank: '+PlayersList[i][24]+'.`' });
								sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! Games: '+PlayersList[i][19]+', ww: '+PlayersList[i][23]+'/'+PlayersList[i][21]+', vill: '+PlayersList[i][22]+'/'+PlayersList[i][20]+'. Elo: '+Math.round(PlayersList[i][26])+', Rank: '+PlayersList[i][24]+'.`');
							else
								//sendMessage({ to: dbInfo.ingamelobbychannel, message: '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! No games played yet.`' });
								sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! No games played yet.`');
							//console.log('<FBot> Player joined: '+PlayersList[i][1]+'@'+PlayersList[i][6]+'. Played '+PlayersList[i][19]+' games ('+Math.round(PlayersList[i][15]/3600)+' hours).');
							
							//report to wc3_log channel
							if(config.ReportIPs)
								sendMessage(config.channels.wc3logchannel, '**'+PlayersList[i][1]+'**@'+serverShort(PlayersList[i][6])+': IP: __'+PlayersList[i][3]+'__, host: __'+PlayersList[i][4]+'__, (__'+PlayersList[i][5]+'__)' );
							
							//Add this player to Players[]
							/*	Players Array Structure
								0 name
								1 server
								2 games played
								3 hours played
								4 wwon
								5 wplayed
								6 vwon
								7 vplayed
								8 Elo
								9 rank
								10 IP
								11 hostname
								12 lastmessage (datetime)
								13 message count
								14 Joining message ID

							*/
							var thisPlayer = [];
							thisPlayer[0] = PlayersList[i][1]; //name
							thisPlayer[1] = PlayersList[i][6]; //server
							thisPlayer[2] = PlayersList[i][19]; //games played
							thisPlayer[3] = PlayersList[i][15]; //hours played
							thisPlayer[4] = PlayersList[i][23]; //wwon
							thisPlayer[5] = PlayersList[i][21]; //wplayed
							thisPlayer[6] = PlayersList[i][22]; //vwon
							thisPlayer[7] = PlayersList[i][20]; //vplayed
							thisPlayer[8] = PlayersList[i][26]; //Elo
							thisPlayer[9] = PlayersList[i][24]; //rank
							thisPlayer[10] = PlayersList[i][3]; //IP
							thisPlayer[11] = PlayersList[i][4]; //hostname 
							thisPlayer[12] = '0'; //lastmessage (datetime)
							thisPlayer[13] = 0; //message count
							thisPlayer[14] = '0'; //Joining message (Discord.Message Class)
							Players.push(thisPlayer);
						}
					}
					//Report missing players (Leaving)
					for(i=0; i<PreviousPlayersList.length; i++)
					{
						if(! findPlayer(PlayersList, PreviousPlayersList[i][1], PreviousPlayersList[i][6]) )
						{
							var plId = findPlayerInPlayers(Players, PreviousPlayersList[i][1], PreviousPlayersList[i][6]);
							//If we have StopSpam option enabled, we delete 'join' messages of players who write less than 'MessagesCountRequired' messages, else show leave message
							if(config.StopReportSpamEnable && Players[plId][13] < config.MessagesCountRequired)
							{
								//Delete Join Message
								var action = [];
								action[0] = 0;
								action[1] = Players[plId][14];
								action[2] = "";
								action[3] = config.channels.ingamelobbychannel;
								Actions.push(action);
							}
							else
								if(Date.now() - LastTimeGameLoadingReported >= config.ReportedSafeTime*1000)
									sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PreviousPlayersList[i][1]+'@'+serverShort(PreviousPlayersList[i][6])+' left!`' );
							
							//remove player from Players[]
							if(plId >= 0)
								Players.splice(plId, 1)
						}
					}
				}
				
				//First read when program just started
				if(LastGameStartedReported == 0 && result[0]['id']>0)
				{
					LastGameStartedReported = result[0]['id'];
					LastGameStatus = result[0]['status'];
					logger.info('First Read of wwt_current_games ID: '+LastGameStartedReported+', Status: '+LastGameStatus);
					if(LastGameStatus == 0)
						LobbyReady = true;
					LastTimeGameLoadingReported = Date.now();
				}
				//game status changed, report game LAUNCH
				else if(LastGameStartedReported == result[0]['id'] && LastGameStatus != result[0]['status'] && result[0]['id']>0 )
				{
					LastGameStatus = result[0]['status'];
					//sendMessage({ to: dbInfo.ingamelobbychannel, message: '<FBot> Game started loading. Players will no longer be able to see your messages.' });
					LobbyReady = false;
					reportGameStart(PreviousPlayersList);
				}
				//New game id captured, report LOBBY CREATION
				else if( LastGameStartedReported !=0 && LastGameStartedReported != result[0]['id'] && result[0]['id']>0 )
				{
					LastGameStartedReported = result[0]['id'];
					LastGameStatus = result[0]['status'];
					//logger.info('New wwt_current_games ID: '+LastGameStartedReported+', Status: '+LastGameStatus);
					//sendMessage({ to: dbInfo.ingamelobbychannel, message: '<FBot> New Lobby was created.' });
					LobbyReady = true;
					reportGameStart(PreviousPlayersList);
				}
				
				//If amount of players in lobby is different from previous, change the name of the channel
				if(result[0]['players'] != CurrentPlayersAmountInLobby)
				{
					if(result[0]['players']<=8)
					{
						var NewName = config.LobbyChannelBaseName+"_"+result[0]['players']+"l8"
						if(ThisIsTestBot)
							logger.info('Changing name to: "'+NewName+'"');
						/*bot.editChannelInfo({
							channelID: dbInfo.ingamelobbychannel,
							name: NewName
						});*/
						bot.channels.get(config.channels.ingamelobbychannel).setName(NewName)
						CurrentPlayersAmountInLobby = result[0]['players'];
					}
				}
				
				if(config.ReportJoinLeaveStartPlayers)
					PreviousPlayersList = PlayersList;
			}
		
		 
	  });
	
	//logger.info('Check!');
			
}

//Update Roles
/*function roleUpdate( callback )
{

	//knex('discord_view').select('discord_userid', 'rank', 'rank_historyMax')
	knex('discord_view').select(knex.raw('CAST(discord_userid AS CHAR) AS discord_userid'), 'rank', 'rank_historyMax')
	.then(function (resultView) { 
		if(resultView.length > 0)
		{
			//console.log(resultView);
			//console.log(bot.users);
			//console.log(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members);
			
			for(z=0; z<resultView.length; z++)
			{
				//console.log(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']]);
				//Find corresponding Discord userAgent
				if(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']])
				{
					//console.log("User: '"+resultView[z]['discord_userid']+"', Rank: "+resultView[z]['rank']+".");
					var IsTop10 = false;
					var IsTop50 = false;
					var IsVeteran = false;
					var IsRegistered = false;
					//console.log(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles);
					for(i=0;i<bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles.length;i++)
					{
						if(dbInfo.role.top10 == bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles[i])
							IsTop10 = true;
						else if(dbInfo.role.top50 == bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles[i])
							IsTop50 = true;
						else if(dbInfo.role.veteran == bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles[i])
							IsVeteran = true;
						else if(dbInfo.role.registered == bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles[i])
							IsRegistered = true;
						//console.log(dbInfo.role.registered);
						//console.log(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[resultView[z]['discord_userid']].roles[i]);
					}
					
					//console.log(resultView[z]['discord_userid']+": Top10: '"+(IsTop10?"YES":"NO")+"', Top50: '"+(IsTop50?"YES":"NO")+"', Veteran: '"+(IsVeteran?"YES":"NO")+"', Registered: '"+(IsRegistered?"YES":"NO")+"'.");
					
					//Give Top10
					if(resultView[z]['rank']<=10 && resultView[z]['rank']>0 && !IsTop10)
					{
						bot.addToRole({ roleID: dbInfo.role.top10, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, you have been given 'Champions' role!" });
					}
					//Give Top50
					if(resultView[z]['rank']<=50 && resultView[z]['rank']>0 && !IsTop50 && !IsTop10 && !IsVeteran && !resultView[z]['rank']<=10 && !resultView[z]['rank_historyMax']<=10)
					{
						bot.addToRole({ roleID: dbInfo.role.top50, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, you have been given 'Top50' role!" });
					}
					//Give Veteran
					if(resultView[z]['rank_historyMax']<=10 && resultView[z]['rank_historyMax']>0 && !IsVeteran && !IsTop10 && !resultView[z]['rank']<=10)
					{
						bot.addToRole({ roleID: dbInfo.role.veteran, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, you have been given 'Veteran' role!" });
					}
					//Give Registered
					if(!IsRegistered)
					{
						bot.addToRole({ roleID: dbInfo.role.registered, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, you have been given 'Registered' role!" });
					}
					
					//Remove Top10
					if(resultView[z]['rank'] > 10 && IsTop10)
					{
						bot.removeFromRole({ roleID: dbInfo.role.top10, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, 'Champions' role was removed from you!" });
					}
					//Remove Top50
					if((resultView[z]['rank']>50 && IsTop50) || (IsTop50 && IsTop10) || (IsTop50 && IsVeteran))
					{
						bot.removeFromRole({ roleID: dbInfo.role.top50, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, 'Top50' role was removed from you!" });
					}
					//Remove Veteran if player has higher rank
					//if(resultView[z]['rank_historyMax']>10 && IsVeteran)
					if(IsVeteran && IsTop10)
					{
						bot.removeFromRole({ roleID: dbInfo.role.veteran, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
						sendMessage({ to: dbInfo.robotSpamChannel, message: "<@"+resultView[z]['discord_userid']+">, 'Veteran' role was removed from you!" });
					}
					//Remove Registered
					//else if(IsRegistered)
					//	bot.removeFromRole({ roleID: dbInfo.role.registered, userID: resultView[z]['discord_userid'], serverID: bot.channels[dbInfo.generalchannel].guild_id });
					
				}
			}
		}
	});
	setTimeout(roleUpdate, (config.RolesUpdateTimeSec * 1000));

}
*/

//Main program loop
function loopHere( callback ) {
	if(BotReady)
	{
		//Check for new players and started games
		check_current_lobby_game( );
		//Check for new messages in chatlog
		print_messages( );	
	}
	setTimeout(loopHere, (config.SecondsDelayMessagesCheck * 1000));	
}

/*function performActions( callback )
{
	//  Actions Array Structure
	//	0 - action 
	//	1 - ID
	//	2 - msg
	//	3 - ChannelID
	//	
	//	Actions:
	//	[0] Delete message of ID in ChannelID
	//	[1] Add Reaction 'msg' to message of ID in ChannelID
	//	[2] Edit message ID with new content 'msg' in ChannelID
	
	//console.log(Actions);
	if(Actions.length > 0)
	{
		//We always read action[0] because it is the oldest
		if(Actions[0][0] == 0)
		{
			//Delete message of ID
			if(Actions[0][3] && Actions[0][1])
				bot.deleteMessage({
					channelID: Actions[0][3],
					messageID: Actions[0][1]
				});
		}
		else if(Actions[0][0] == 1)
		{
			//Add Reaction 'msg' to message of ID
			bot.addReaction({
				channelID: Actions[0][3],
				messageID: Actions[0][1],
				reaction: Actions[0][2]
			}, function(err, res) {
				if (err) { logger.error("Couldn't Add Reaction '"+Actions[0][2]+"'!") }
			});
		}
		else if(Actions[0][0] == 2)
		{
			//Edit message ID with new content 'msg'
			
		}
		//delete this action
		Actions.splice(0, 1)
	}
	setTimeout(performActions, ActionsWaitTime);
}
*/

//Run the main Loop
loopHere( );
//performActions( );
//roleUpdate( );			

/*
bot.on('message', function (user, userID, channelID, message, evt) {
	
	
    // Our bot needs to know if it needs to execute a command
    // for this script it will listen for messages that will start with `!`
    
	//Message is in lobby-chat-channel and its not bot himself
	if(channelID == dbInfo.ingamelobbychannel && userID != dbInfo.botSelfUserID )
	{
		//console.log(message);
		if(LobbyReady)
		{
			var msgToSend = "";
			var userName = user;
			//console.log(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[userID]);
			if(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[userID])
				if(bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[userID].nick && bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[userID].nick != user)
					userName = bot.servers[bot.channels[dbInfo.generalchannel].guild_id].members[userID].nick;
			
			if(message.length > config.RowCharactersLimit)
			{
				msgToSend = message.substring(0, config.RowCharactersLimit);
				sendMessage({ to: dbInfo.ingamelobbychannel, message: '<FBot> Your message was too long and got cutted!' });
			}
			else
				msgToSend = message;
			if(ThisIsTestBot)
				logger.info(user+': '+msgToSend);
			msgToSend = emoji.unemojify(msgToSend);
			if(ThisIsTestBot)
				logger.info(user+': (emojiReplace): '+msgToSend);
			msgToSend = msgToSend.replace(/[^a-zA-Zа-яА-Я :!$?\(\)\-\+\\\/\[\]0-9*\^\%\@~\"\'<>;:.,=_]/g, "");
			//var qry = knex('chatlog').insert({datetime: knex.fn.now(), gameid: LastGameStartedReported, gamestatus: '0', gameFinished: '0', name: user, message: message, target: 'DISCORD'}).into('wwt_current_games')
			knex('chatlog').insert({gameid: LastGameStartedReported, gamestatus: '0', gameFinished: '0', name: user, message: userName+': '+msgToSend, target: 'DISCORD'}).into('chatlog').then(function (a) {  });
			
			//console.log(qry.toString());
		}
		else
			sendMessage({ to: dbInfo.ingamelobbychannel, message: '<FBot> Lobby is not created yet, there is noone to talk to here. Wait few seconds please.' });
		
		//knex('chatlog').insert({title: 'Slaughterhouse Five'})
	}
	
	//'suggestions' channel message checking and adding Vote emoji's
	if(channelID == dbInfo.suggestionschannel && userID != dbInfo.botSelfUserID)
	{
		//var UsersIDs = []; 		//IDs of users that wrote in 'sugestions' channel
		//var UsersTimes = [];	//When that happend (above)
		var passed = true;
		var addUser = false;
		if(UsersIDs.length > 0)
		{
			var arrayID = UsersIDs.indexOf(userID);
			if(arrayID > -1)
			{
				if(Date.now() - UsersTimes[arrayID] <= config.SuggestionsTimeoutHours*3600000)
					passed = false;
				else
					UsersTimes[arrayID] = Date.now();
			}
			else
				addUser = true;
		}
		else
			addUser = true;
		
		if(addUser)
		{
			//Add user to the array
			UsersIDs.push(userID);
			UsersTimes.push(Date.now());
			//logger.info('RepeatedMessage in <Suggestions> by user '+user+', Date: '+Date.now()+', Message: ');
			//logger.info(message);
		}
		
		//var SuggestionsTimeoutMinutes = 15; 	//Users wont be able to write messages to 'sugestions' channel more often than this amount of minutes
		//var config.SuggestionsDeleteWaitTime = 60;		//Messages that are written in less than (above) minutes will be deleted after this amount of seconds
		if(passed)
		{
			//Add ThumbsUp/Down to every message in 'suggestions' channel
			
			setTimeout(function () {
					var action = [];
					action[0] = 1;
					action[1] = evt.d.id;
					action[2] = "👍";
					//action[2] = "<408769454344896513>";
					action[3] = channelID;
					Actions.push(action);
					var action = [];
					action[0] = 1;
					action[1] = evt.d.id;
					action[2] = "👎";
					//action[2] = "<408769454315536384>";
					action[3] = channelID;
					Actions.push(action);
					
				}, 100);
		}
		else
		{
			logger.info('RepeatedMessage in <Suggestions> by user '+user+', Date: '+Date.now()+', Message: ');
			logger.info(message);
			
			sendMessage({ to: dbInfo.suggestionschannel, message: '<@'+userID+'>, This channel is made for suggestions only, you can write here only once per '+config.SuggestionsTimeoutHours+' hours.\nIf you wanted to add something to your suggestion, please, edit your previous message and add it there.\nIf you want to discuss someone’s suggestion, use <#381052237306265601> channel.\nYour last message will be deleted in '+config.SuggestionsDeleteWaitTime+' seconds, quickly, copy it before it disappears! :worried:' });
			setTimeout(function () {
					var action = [];
					action[0] = 0;
					action[1] = evt.d.id;
					action[2] = "";
					action[3] = dbInfo.suggestionschannel;
					Actions.push(action);
				}, config.SuggestionsDeleteWaitTime*1000);
		}
	}
	
	//Delete own Bot's Warning messages after timeout
	if(channelID == dbInfo.suggestionschannel && userID == dbInfo.botSelfUserID)
	{
		setTimeout(function () {
			var action = [];
			action[0] = 0;
			action[1] = evt.d.id;
			action[2] = "";
			action[3] = dbInfo.suggestionschannel;
			Actions.push(action);
		}, config.SuggestionsDeleteWaitTime*1000);
	}
	
	//Chat the Log in log file
	if(config.EnableChatLog)
	{
		var channelName = "";
		if(channelID == dbInfo.ingamelobbychannel)
			channelName = config.LobbyChannelBaseName;
		else
			if(bot.channels[channelID])
				channelName = bot.channels[channelID].name;
			else
				channelName = "Private";
		
		var writeThis = evt.d.timestamp+" "+evt.d.author.username+" (ID:"+evt.d.author.id+"): "+evt.d.content+"\n"
		
		fs.appendFile(config.ChatLogRootFolder+channelName+".log", writeThis, function(err) {
			if(err) {
				logger.error("Error Writing Message log file: "+err);
			}

			//console.log("The file was saved!");
		});
	}
	
	//Capture Player Join messages in in-game_lobby channel
	if(channelID == dbInfo.ingamelobbychannel && userID == dbInfo.botSelfUserID )
	{
		var regex = /([\S]+)[@]([a-zA-Z.]+) joined!/i;
		var found = message.match(regex);
		if(found)
		{
			var server = "";
			if(found[2] == "useast")
				server = "useast.battle.net";
			else if(found[2] == "uswest")
				server = "uswest.battle.net";
			else if(found[2] == "europe")
				server = "europe.battle.net";
			else if(found[2] == "asia")
				server = "asia.battle.net";
			else if(found[2] == "eurobattle")
				server = "server.eurobattle.net";
			else
				server = found[2];
			var plId = findPlayerInPlayers(Players, found[1], server);
			if(plId>=0)
			{
				Players[plId][14] = evt.d.id;
			}
		}
	}
	//Delete error reply
	if( ( message == responces.UnknownCommandMsg || message == responces.HelpNotify || message == responces.UnknownArgument || message == responces.UnknownAuthCode || message == responces.AuthMessage || message == responces.AuthMessageChanged || message == responces.RandomQuoteWrong || message == responces.CommandNotAllowedHere) && channelID != dbInfo.robotSpamChannel && userID == dbInfo.botSelfUserID )
	{
		setTimeout(function () {
			var action = [];
			action[0] = 0;
			action[1] = evt.d.id;
			action[2] = "";
			action[3] = channelID;
			Actions.push(action);
		}, config.InfMsgDisplayTimeSec*1000);
	}
		
	
	if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];

        args = args.splice(1);

        switch(cmd) {
			// !help
            case 'commands':
			case 'tip':
			case 'tips':
			case 'help':
			{
                //Send in private chat
				sendMessage({
					to: userID,
					message: responces.HelpMessage
				});
				sendMessage({
					to: channelID,
					message: responces.HelpNotify
				});
				break;
			}
			case 'auth':
			case 'authme':
			case 'authenticate':
			case 'register':
			case 'reg':
			{
			    var AllGood = true;
				if(args == "uE6dZ" || !args)
				{
					sendMessage({ to: channelID, message: responces.UnknownAuthCode });
					AllGood = false;
				}
				else
				{
				  knex('gametrack')
				  .select('id', 'name', 'realm')
					.where('password', '=', args)
				  .then(function (result) { 
						
						if(result.length == 1)
						{
							//result[0]['players_list'].split("	");
							knex('discord').select('id')
								.where('gametrack_id', '=', result[0]['id'])
								.orWhere('discord_userid', '=', userID)
							  .then(function (resultTwo) {
									if(resultTwo.length > 0)
									{
										//There is already record in 'discord' table, update it!
										knex('discord')
										.where('id', '=', resultTwo[0]['id'])
										.update({
										  gametrack_id: result[0]['id'],
										  wc3_name: result[0]['name'],
										  wc3_server : result[0]['realm'],
										  discord_userid: userID,
										  discord_name: user
										})
										.then(function(a) {
											logger.info("Auth: Updating discord record for user '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+user+") ID:'"+userID+"'.");
											sendMessage({ to: channelID, message: responces.AuthMessageChanged });
										})
										.catch(function(error) {
											logger.error(error)
										});
									}
									else
									{
										//Insert new record
										knex('discord').insert({
											  gametrack_id: result[0]['id'],
											  wc3_name: result[0]['name'],
											  wc3_server : result[0]['realm'],
											  discord_userid: userID,
											  discord_name: user
											}).into('discord').then(function (a) { 
												logger.info("Auth: Adding new record for user '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+user+") ID:'"+userID+"'.");
												sendMessage({ to: channelID, message: responces.AuthMessage });
											});
										
										
									}
									//Reset password back to default
									knex('gametrack')
										.where('id', '=', result[0]['id'])
										.update({
										  password: "uE6dZ"
										})
										.then(function(a) {
											//logger.info("Auth: Updating discord record for user wc3: '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+user+").");
										})
										.catch(function(error) {
											logger.error(error)
										});
							});
						}
						else
						{
							sendMessage({ to: channelID, message: responces.AuthCodeNotFound });
							//break;
							AllGood = false;
						}
						
				  });
				}
				if(AllGood)
				{
					
				}

			  
			  break;
			}
			case 'notify':
			case 'notifyme':
			{
                if(!args)
				{
					//Notify this user when current lobby starts loading
					
				}
				else if(args == "off" || args == 0)
				{
					//disable notification for current user
					
				}
				else if(args+1 > 0)
				{
					//Notify user when there are 'args' amount of players in the lobby
					
				}
				else
					sendMessage({ to: channelID, message: responces.UnknownArgument });	
				
				break;
			}
			case 'quote':
			case 'q':
			{
				if(channelID != dbInfo.ingamelobbychannel)
				{
					var requestString = args[0].split('@');
					var who = requestString[0];
					var whereThis = requestString[1];
					
					//SELECT * FROM `chatlog` WHERE name="kidseatfree" AND server="useast.battle.net" AND CHAR_LENGTH(message)>30 ORDER BY RAND() LIMIT 1 
					if(who && whereThis)
					{
						knex('chatlog')
					  .select('message', 'name', 'server')
						.where('name', 'like', "%"+who+"%")
						.andWhere('server', 'like', "%"+whereThis+"%")
						.andWhere(knex.raw('CHAR_LENGTH(message)'), '>', "30")
						.orderBy(knex.raw('RAND()'), 'desc')
						.limit(1)
					  .then(function (result) { 
							
							if(result.length == 1)
							{
								sendMessage({ to: channelID, message: result[0]['name']+"@"+serverShort(result[0]['server'])+" once said:\n```fix\n"+result[0]['message']+"\n```" });
							}
							else
							{
								sendMessage({ to: channelID, message: "No quotes found :(" });
								//break;
								AllGood = false;
							}
							
					  });
						
						
					}
					else if(requestString == "random" || requestString == "rand")
					{
						knex('chatlog')
					  .select('message', 'name', 'server')
						.where(knex.raw('CHAR_LENGTH(message)'), '>', "30")
						.andWhere('server', '!=', "")
						.orderBy(knex.raw('RAND()'), 'desc')
						.limit(1)
					  .then(function (result) { 
							
							if(result.length == 1)
							{
								sendMessage({ to: channelID, message: result[0]['name']+"@"+serverShort(result[0]['server'])+" once said:\n```fix\n"+result[0]['message']+"\n```" });
							}
							
					  });
					}
					else
					{
						sendMessage({ to: channelID, message: responces.RandomQuoteWrong });
					}
				}
				else
				{
					sendMessage({ to: channelID, message: responces.CommandNotAllowedHere });
				}
				
				
				break;
			}
            break;
            default:
			{
				sendMessage({ to: channelID, message: responces.UnknownCommandMsg });
			}
        }
		//Delete command if it is not in robot_spam channel
		if(channelID != dbInfo.robotSpamChannel)
			setTimeout(function () {
				var action = [];
				action[0] = 0;
				action[1] = evt.d.id;
				action[2] = "";
				action[3] = channelID;
				Actions.push(action);
			}, config.CommandsDeleteTimeSec*1000);
    }
})
*/