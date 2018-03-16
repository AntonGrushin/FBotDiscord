const Discord = require('discord.js');
const bot = new Discord.Client();
var logger = require('winston');
//var emoji = require('node-emoji')
var emoji = require('./node-emoji_copy/index.js')
var fs = require('fs');

var ThisIsTestBot = false;

if(ThisIsTestBot)
	var config = require('./configTest');
else
	var config = require('./config');

// turn off limits by default (BE CAREFUL)
require('events').EventEmitter.prototype._maxListeners = 0;

//Knex
var knex = require('knex')(config.db);

//technical
var LastMessageId = 0;
var GotLastId = false;
var LastGameStartedReported = 0;
var LastGameIdRead = 0;
var LastGameStatus = 0;
var LastGameFisnishedReported = 0;
var LobbyReady = false;
var PreviousPlayersList = [];
var CurrentPlayersAmountInLobby = 0;
var LastTimeGameLoadingReported = 0;

var UsersIDs = []; 		//IDs of users that wrote in 'sugestions' channel
var UsersTimes = [];	//When that happend (above)

var Players = [];
var BotReady = false; //This turns true when we are connected

//Messages to reply
//Read responses from files
var responses = require('./responses/otherResponses.js');
var HelpMessage = "";
fs.readFile('./responses/helpResponce.txt', 'utf8', function(err, data) { HelpMessage = data; });

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
function sendMessage( channel, message, debud_num=0 )
{
	//console.log(debud_num+": "+channel+" : "+message)
	if(BotReady && message.length > 0)
		bot.channels.get(channel).send(message);
}


// Log connection errors
bot.on('error', function(message) {
    logger.warn('----- Error: ', message);
});

// Login
bot.login(config.token);


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
					//accumulate message string
					if(n != 0 )
						messageHere += "\n";
					messageHere += "**"+row["name"]+":** "+row["message"];
					LastMessageId = row["id"];
					
					//count messages of this player
					var plId = findPlayerInPlayers(Players, row["name"], row["server"]);
					if(plId >= 0)
						Players[plId][13] ++;
					n++;
		});
		 
		 //If we have a message to send, do it
		 if( GotLastId && n>0 )
			sendMessage(config.channels.ingamelobbychannel, messageHere);
		 if( !GotLastId )
		 {
			GotLastId = true;
			logger.info('LastId is set to: '+LastMessageId);
		 }
	  });
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

function addRemoveRole( guildMember, role, toAdd=true )
{
	var ThisRole = bot.guilds.get(config.guildId).roles.get(role);
	//Add the role
	if(toAdd)
	{
		guildMember.addRole(role);
		sendMessage(config.channels.robotSpamChannel, responses.RoleGiven.replace('%USERID%', guildMember.id).replace('%ROLENAME%', ThisRole.name) );
	}
	//Remove the role
	else
	{
		guildMember.removeRole(role);
		sendMessage(config.channels.robotSpamChannel, responses.RoleRemoved.replace('%USERID%', guildMember.id).replace('%ROLENAME%', ThisRole.name) );
	}
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
							if( LastGameStartedReported != 0 )
							{
								if(PlayersList[i][19]>0)	//Player '+PlayersList[i][1]+'@'+PlayersList[i][6]+' joined
									sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! Games: '+PlayersList[i][19]+', ww: '+PlayersList[i][23]+'/'+PlayersList[i][21]+', vill: '+PlayersList[i][22]+'/'+PlayersList[i][20]+'. Elo: '+Math.round(PlayersList[i][26])+', Rank: '+PlayersList[i][24]+'.`');
								else
									sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PlayersList[i][1]+'@'+serverShort(PlayersList[i][6])+' joined! No games played yet.`');
								
								//report to wc3_log channel
								if(config.ReportIPs)
									sendMessage(config.channels.wc3logchannel, '**'+PlayersList[i][1]+'**@'+serverShort(PlayersList[i][6])+': IP: __'+PlayersList[i][3]+'__, host: __'+PlayersList[i][4]+'__, (__'+PlayersList[i][5]+'__)' );
							}
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
						if(! findPlayer(PlayersList, PreviousPlayersList[i][1], PreviousPlayersList[i][6]) && LastGameIdRead == result[0]['id'])
						{
							var plId = findPlayerInPlayers(Players, PreviousPlayersList[i][1], PreviousPlayersList[i][6]);
							//If we have StopSpam option enabled, we delete 'join' messages of players who write less than 'MessagesCountRequired' messages, else show leave message
							if(config.StopReportSpamEnable && Players[plId][13] < config.MessagesCountRequired)
							{
								//Delete Join Message
								if(Players[plId][14] != '0')
									Players[plId][14].delete();
							}
							else
								if(Date.now() - LastTimeGameLoadingReported >= config.ReportedSafeTime*1000)
									sendMessage(config.channels.ingamelobbychannel, '`<FBot> '+PreviousPlayersList[i][1]+'@'+serverShort(PreviousPlayersList[i][6])+' left!`' );
							
							//remove player from Players[]
							if(plId >= 0)
								Players.splice(plId, 1)
						}
					}
					LastGameIdRead = result[0]['id'];
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
function roleUpdate( callback )
{
	if(BotReady)
	{
		
		//knex('discord_view').select('discord_userid', 'rank', 'rank_historyMax')
		knex('discord_view').select(knex.raw('CAST(discord_userid AS CHAR) AS discord_userid'), 'rank', 'rank_historyMax')
		.then(function (resultView) { 
			if(resultView.length > 0)
			{
				//console.log(resultView);
				//console.log(bot.guilds.first().members.get(resultView[z]['discord_userid']).roles);
				
				for(z=0; z<resultView.length; z++)
				{
					//if(bot.guilds.first().members.find('id', resultView[z]['discord_userid']))
					//	console.log(bot.guilds.first().members.find('id', resultView[z]['discord_userid']).nickname);
					var guildMember = bot.guilds.get(config.guildId).members.find('id', resultView[z]['discord_userid']);

					
					//If this user is member of current guild
					if(guildMember)
					{
						var IsTop10 = false;
						var IsTop50 = false;
						var IsVeteran = false;
						var IsRegistered = false;
						
						var WillHaveTop10 = false;
						var WillHaveTop50 = false;
						var WillHaveVeteran = false;
						var WillHaveRegistered = false;
						
						// Find out what roles this guild member has
						if(guildMember.roles.get( config.roles.top10 ))
							IsTop10 = true;
						if(guildMember.roles.get( config.roles.top50 ))
							IsTop50 = true;
						if(guildMember.roles.get( config.roles.veteran ))
							IsVeteran = true;
						if(guildMember.roles.get( config.roles.registered ))
							IsRegistered = true;
						
						// Find out what roles should be given
						//top10
						if(resultView[z]['rank']<=10 && resultView[z]['rank']>0)
							WillHaveTop10 = true;
						//veteran
						if(resultView[z]['rank_historyMax']<=10 && resultView[z]['rank_historyMax']>0)
							WillHaveVeteran = true;
						//top50
						if(resultView[z]['rank']<=50 && resultView[z]['rank']>0 )
							WillHaveTop50 = true;
						if(!IsRegistered)
							WillHaveRegistered = true;
						
						//Debug line
						//console.log(resultView[z]['discord_userid']+": IsTop10: "+(IsTop10?"YES":"NO")+", IsTop50: "+(IsTop50?"YES":"NO")+", IsVeteran: "+(IsVeteran?"YES":"NO")+"; =====  WillHaveTop10: "+(WillHaveTop10?"YES":"NO")+", WillHaveTop50: "+(WillHaveTop50?"YES":"NO")+", WillHaveVeteran: "+(WillHaveVeteran?"YES":"NO"));
						
						// == Give & Remove roles ==
						//registered
						if(WillHaveRegistered && !IsRegistered)
						{
							addRemoveRole( guildMember, config.roles.registered )
						}
						//top10
						if(!IsTop10 && WillHaveTop10)
						{
							addRemoveRole( guildMember, config.roles.top10 )
							
							//Remove other roles
							if(IsTop50)
								addRemoveRole( guildMember, config.roles.top50, false )
							if(IsVeteran)
								addRemoveRole( guildMember, config.roles.veteran, false )
							
							WillHaveTop50 = false;
							WillHaveVeteran = false;
						}
						//veteran
						if(WillHaveVeteran && !IsVeteran && !WillHaveTop10)
						{
							addRemoveRole( guildMember, config.roles.veteran )
							
							//Remove other roles
							if(IsTop50)
								addRemoveRole( guildMember, config.roles.top50, false )
							if(IsTop10)
								addRemoveRole( guildMember, config.roles.top10, false )
							WillHaveTop50 = false;
						}
						//top50
						if(WillHaveTop50 && !IsVeteran && !IsTop50 && !WillHaveTop10 && !WillHaveVeteran)
						{
							addRemoveRole( guildMember, config.roles.top50 )
							
							//Remove other roles
							if(IsTop50)
								addRemoveRole( guildMember, config.roles.top50, false )
							if(IsTop10)
								addRemoveRole( guildMember, config.roles.top10, false )
						}
					}
				}
			}
		});
	}
	setTimeout(roleUpdate, (config.RolesUpdateTimeSec * 1000));

}


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

//Run the main Loop
loopHere( );
roleUpdate();


//Handle Commands
bot.on('message', msg => {	
	
	//user		msg.author.username
	//userID 		msg.author.id
	//channelID	msg.channel.id
	//messageid	msg.id
	
	
	
	
    // Our bot needs to know if it needs to execute a command
    // for this script it will listen for messages that will start with `!`
    
	//Message is in lobby-chat-channel and its not bot himself
	if(msg.channel.id == config.channels.ingamelobbychannel && msg.author.id != config.channels.botSelfUserID )
	{
		//console.log(message);
		if(LobbyReady)
		{
			var msgToSend = "";
			var userName = msg.author.username;
			//Change name if user has nickname on this guild
			if(bot.guilds.get(msg.guild.id).members.find('id', msg.author.id).nickname != null)
				userName = bot.guilds.get(msg.guild.id).members.find('id', msg.author.id).nickname
			
			
			if(msg.content.length > config.RowCharactersLimit)
			{
				msgToSend = msg.content.substring(0, config.RowCharactersLimit);
				sendMessage(config.channels.ingamelobbychannel, '<FBot> Your message was too long and got cutted!' );
			}
			else
				msgToSend = msg.content;
			if(ThisIsTestBot)
				logger.info(msg.author.username+': '+msgToSend);
			msgToSend = emoji.unemojify(msgToSend);
			if(ThisIsTestBot)
				logger.info(msg.author.username+': (emojiReplace): '+msgToSend);
			msgToSend = msgToSend.replace(/[^a-zA-Zа-яА-Я :!$?\(\)\-\+\\\/\[\]0-9*\^\%\@~\"\'<>;:.,=_]/g, "");
			knex('chatlog').insert({gameid: LastGameStartedReported, gamestatus: '0', gameFinished: '0', name: msg.author.username, message: userName+': '+msgToSend, target: 'DISCORD'}).into('chatlog').then(function (a) {  });
			
			//console.log(qry.toString());
		}
		else
			sendMessage(config.channels.ingamelobbychannel, '<FBot> Lobby is not created yet, there is noone to talk to here. Wait few seconds please.' );
		
		//knex('chatlog').insert({title: 'Slaughterhouse Five'})
	}
	
	//'suggestions' channel message checking and adding Vote emoji's
	if(msg.channel.id == config.channels.suggestionschannel && msg.author.id != config.channels.botSelfUserID)
	{
		var passed = true;
		var addUser = false;
		if(UsersIDs.length > 0)
		{
			var arrayID = UsersIDs.indexOf(msg.author.id);
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
			UsersIDs.push(msg.author.id);
			UsersTimes.push(Date.now());
		}
		
		if(passed)
		{
			//Add ThumbsUp/Down to every message in 'suggestions' channel
			if(ThisIsTestBot)
			{
				msg.react("👍");
				msg.react("👎");
			}
			else
			{
				msg.react(msg.guild.emojis.get('408769454344896513'));
				msg.react(msg.guild.emojis.get('408769454315536384'));
			}
		}
		else
		{
			logger.info('RepeatedMessage in <Suggestions> by user '+msg.author.username+', Date: '+Date.now()+', Message: ');
			logger.info(msg.content);
			
			sendMessage(config.channels.suggestionschannel, responses.RepeatedSuggestion.replace('%USERID%', msg.author.id).replace('%TIMEOUTHOURS%', config.SuggestionsTimeoutHours).replace('%DELETEWAITTIME%', config.SuggestionsDeleteWaitTime) );
			msg.delete( config.SuggestionsDeleteWaitTime*1000 );
		}
	}
	
	//Delete own Bot's Warning messages after timeout
	if(msg.channel.id == config.channels.suggestionschannel && msg.author.id == config.channels.botSelfUserID)
		msg.delete( config.SuggestionsDeleteWaitTime*1000 );
	
	//Write the chat in log file
	if(config.EnableChatLog)
	{
		var channelName = "";
		if(msg.channel.id == config.channels.ingamelobbychannel)
			channelName = config.LobbyChannelBaseName;
		else
			if(bot.channels[msg.channel.id])
				channelName = bot.channels[msg.channel.id].name;
			else
				channelName = "Private";
		
		var writeThis = msg.createdTimestamp+" "+msg.author.username+" (ID:"+msg.author.id+"): "+msg.content+"\n"
		
		fs.appendFile(config.ChatLogRootFolder+channelName+".log", writeThis, function(err) {
			if(err) {
				logger.error("Error Writing Message log file: "+err);
			}
		});
	}
	
	//Capture Player Join messages in in-game_lobby channel
	if(msg.channel.id == config.channels.ingamelobbychannel && msg.author.id == config.channels.botSelfUserID )
	{
		var regex = /([\S]+)[@]([a-zA-Z.]+) joined!/i;
		var found = msg.content.match(regex);
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
				Players[plId][14] = msg;
			}
		}
	}
	//Delete bot reply
	if( ( msg.content == responses.UnknownCommandMsg || msg.content == responses.HelpNotify || msg.content == responses.UnknownArgument || msg.content == responses.UnknownAuthCode || msg.content == responses.AuthMessage || msg.content == responses.AuthMessageChanged || msg.content == responses.RandomQuoteWrong || msg.content == responses.CommandNotAllowedHere) && msg.channel.type != "dm" && msg.channel.id != config.channels.robotSpamChannel && msg.author.id == config.channels.botSelfUserID )
	{
		msg.delete( config.InfMsgDisplayTimeSec*1000 );
	}
		
	
	if (msg.content.substring(0, 1) == '!') {
        var args = msg.content.substring(1).split(' ');
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
				msg.author.send(HelpMessage)
				if(msg.channel.type != "dm")
					msg.reply(responses.HelpNotify);
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
					sendMessage(msg.channel.id, responses.UnknownAuthCode );
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
							knex('discord').select('id')
								.where('gametrack_id', '=', result[0]['id'])
								.orWhere('discord_userid', '=', msg.author.id)
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
										  discord_userid: msg.author.id,
										  discord_name: msg.author.username
										})
										.then(function(a) {
											logger.info("Auth: Updating discord record for user '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+msg.author.username+") ID:'"+msg.author.id+"'.");
											sendMessage(msg.channel.id, responses.AuthMessageChanged );
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
											  discord_userid: msg.author.id,
											  discord_name: msg.author.username
											}).into('discord').then(function (a) { 
												logger.info("Auth: Adding new record for user '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+msg.author.username+") ID:'"+msg.author.id+"'.");
												sendMessage(msg.channel.id, responses.AuthMessage );
											});
										
										
									}
									//Reset password back to default and set registration flag in 'gametrack' table
									knex('gametrack')
										.where('id', '=', result[0]['id'])
										.update({
										  password: "uE6dZ", discordRegistered: "1"
										})
										.then(function(a) {
											//logger.info("Auth: Updating discord record for user wc3: '"+result[0]['name']+"@"+serverShort(result[0]['realm'])+"' ("+msg.author.username+").");
										})
										.catch(function(error) {
											logger.error(error)
										});
							});
						}
						else
						{
							sendMessage(msg.channel.id, responses.AuthCodeNotFound );
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
					//TODO Notify this user when current lobby starts loading
					
				}
				else if(args == "off" || args == 0)
				{
					//TODO disable notification for current user
					
				}
				else if(args+1 > 0)
				{
					//TODO Notify user when there are 'args' amount of players in the lobby
					
				}
				else
					sendMessage(msg.channel.id, responses.UnknownArgument );	
				
				break;
			}
			case 'quote':
			case 'q':
			{
				if(msg.channel.id != config.channels.ingamelobbychannel)
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
								sendMessage(msg.channel.id, result[0]['name']+"@"+serverShort(result[0]['server'])+" once said:\n```fix\n"+result[0]['message']+"\n```" );
							}
							else
							{
								sendMessage(msg.channel.id, "No quotes found :(" );
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
								sendMessage(msg.channel.id,result[0]['name']+"@"+serverShort(result[0]['server'])+" once said:\n```fix\n"+result[0]['message']+"\n```" );
							}
							
					  });
					}
					else
					{
						sendMessage(msg.channel.id, responses.RandomQuoteWrong );
					}
				}
				else
				{
					sendMessage(msg.channel.id, responses.CommandNotAllowedHere );
				}
				
				
				break;
			}
            break;
            default:
			{
				sendMessage(msg.channel.id, responses.UnknownCommandMsg );
			}
        }
		//Delete command if it is not in robot_spam channel and not a private message
		if(msg.channel.id != config.channels.robotSpamChannel && msg.channel.type != "dm")
			msg.delete( config.CommandsDeleteTimeSec*1000 )
    }
})
