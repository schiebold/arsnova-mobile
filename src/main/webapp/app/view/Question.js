/*--------------------------------------------------------------------------+
 This file is part of ARSnova.
 app/view/Question.js
 - Beschreibung: Template für einzelne Fragen.
 - Version:      1.0, 01/05/12
 - Autor(en):    Christian Thomas Weber <christian.t.weber@gmail.com>
 +---------------------------------------------------------------------------+
 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public License
 as published by the Free Software Foundation; either version 2
 of the License, or any later version.
 +---------------------------------------------------------------------------+
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 +--------------------------------------------------------------------------*/
Ext.define('ARSnova.view.Question', {
	extend: 'Ext.Panel',
	
	requires: ['ARSnova.model.Answer',
	           'ARSnova.view.CustomMask'],
	
	config: {
		scrollable: {
			direction: 'vertical',
			directionLock: true
		}
	},
	
	abstentionInternalId: 'ARSnova_Abstention',
	abstentionAnswer: null,
	
	constructor: function(args) {
		this.callParent(args);
		
		var self = this; // for use inside callbacks
		this.viewOnly = args.viewOnly;
		this.questionObj = args.questionObj;
		
		var answerStore = Ext.create('Ext.data.Store', {model: 'ARSnova.model.Answer'});
		answerStore.add(this.questionObj.possibleAnswers);
		
		this.on('preparestatisticsbutton', function(button) {
			button.scope = this;
			button.setHandler(function() {
				var panel = ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel || ARSnova.app.mainTabPanel.tabPanel.speakerTabPanel;
				panel.questionStatisticChart = Ext.create('ARSnova.view.speaker.QuestionStatisticChart', {
					question	: self.questionObj,
					lastPanel	: self
				});
				ARSnova.app.mainTabPanel.animateActiveItem(panel.questionStatisticChart, 'slide');
			});
		});
		
		var saveAnswer = function(answer) {
			answer.saveAnswer({
				success: function() {
					var questionsArr = Ext.decode(localStorage.getItem('questionIds'));
					if (questionsArr.indexOf(self.questionObj._id) == -1) {
						questionsArr.push(self.questionObj._id);
					}
					localStorage.setItem('questionIds', Ext.encode(questionsArr));
					
					self.disableQuestion();
					ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.showNextUnanswered();
					ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.checkIfLastAnswer();
				},
				failure: function(response, opts) {
					console.log('server-side error');
					Ext.Msg.alert(Messages.NOTIFICATION, Messages.ANSWER_CREATION_ERROR);
				}
			});
		};
		
		this.markCorrectAnswers = function() {
			if (this.questionObj.showAnswer) {
				// Mark all possible answers as 'answered'. This will highlight all correct answers.
				this.answerList.getStore().each(function(item) {
					item.set("questionAnswered", true);
				});
			}
		};
		
		this.saveMcQuestionHandler = function() {
			Ext.Msg.confirm('', Messages.SUBMIT_ANSWER, function(button) {
				if (button !== 'yes') {
					return;
				}
				
				var selectedIndexes = [];
				this.answerList.getSelection().forEach(function(node) {
					selectedIndexes.push(this.answerList.getStore().indexOf(node));
				}, this);
				this.markCorrectAnswers();
				
				var answerValues = [];
				for (var i=0; i < this.answerList.getStore().getCount(); i++) {
					answerValues.push(selectedIndexes.indexOf(i) !== -1 ? "1" : "0");
				}
				
				self.getUserAnswer().then(function(answer) {
					answer.set('answerText', answerValues.join(","));
					saveAnswer(answer);
				});
			}, this);
		};
		
		this.mcAbstentionHandler = function() {
			Ext.Msg.confirm('', Messages.SUBMIT_ANSWER, function(button) {
				if (button !== 'yes') {
					return;
				}
				
				self.getUserAnswer().then(function(answer) {
					answer.set('abstention', true);
					self.answerList.deselectAll();
					saveAnswer(answer);
				});
			}, this);
		};
		
		var questionListener = this.viewOnly || this.questionObj.questionType === "mc" ? {} : {
			'itemtap': function(list, index, target, record) {
				var confirm = function(answer, handler) {
					Ext.Msg.confirm(Messages.ANSWER + ' "' + answer + '"', Messages.SUBMIT_ANSWER, handler);
				};
				if (record.get('id') === self.abstentionInternalId) {
					return confirm(Messages.ABSTENTION, function(button) {
						if (button !== 'yes') {
							return;
						}
						self.getUserAnswer().then(function(answer) {
							answer.set('abstention', true);
							saveAnswer(answer);
						});
					});
				}
				var answerObj = self.questionObj.possibleAnswers[index];
				
				/* for use in Ext.Msg.confirm */
				answerObj.selModel = list;
				answerObj.target = target;

				var theAnswer = answerObj.id || answerObj.text;
				
				confirm(theAnswer, function(button) {
					if (button == 'yes') {
						self.markCorrectAnswers();
						
						self.getUserAnswer().then(function(answer) {
							answer.set('answerText', answerObj.text);
							saveAnswer(answer);
						});
					} else {
						answerObj.selModel.deselect(answerObj.selModel.selected.items[0]);
					}
				});
			}
		};
		
		this.questionTitle = Ext.create('Ext.Panel', {
			cls: 'roundedBox',
			html: 
				'<p class="title">' + Ext.util.Format.htmlEncode(this.questionObj.subject) + '<p/>' +
				'<p>' + Ext.util.Format.htmlEncode(this.questionObj.text) + '</p>'
		});
		
		this.answerList = Ext.create('Ext.List', {
			store: answerStore,
			
			cls: 'roundedBox',
			variableHeights: true,	
			scrollable: { disabled: true },
			
			itemTpl: new Ext.XTemplate(
				'{text:htmlEncode}',
				'<tpl if="correct === true && this.isQuestionAnswered(values)">',
					'&nbsp;<span style="padding: 0 0.2em 0 0.2em" class="x-list-item-correct">&#10003; </span>',
				'</tpl>',
				{
					isQuestionAnswered: function(values) {
						return values.questionAnswered === true;
					}
				}
			),
			
			listeners: {
				scope: this,
				selectionchange: function(list, records, eOpts) {
					if (list.getSelectionCount() > 0) {
						this.mcSaveButton.enable();
					} else {
						this.mcSaveButton.disable();
					}
				},
				/**
				 * The following events are used to get the computed height of all list items and 
				 * finally to set this value to the list DataView. In order to ensure correct rendering
				 * it is also necessary to get the properties "padding-top" and "padding-bottom" and 
				 * add them to the height of the list DataView.
				 */
		        painted: function (list, eOpts) {
		        	this.answerList.fireEvent("resizeList", list);
		        },
		        resizeList: function(list) {
		        	var listItemsDom = list.select(".x-list .x-inner .x-inner").elements[0];
		        	
		        	this.answerList.setHeight(
		        		parseInt(window.getComputedStyle(listItemsDom, "").getPropertyValue("height"))	+ 
		        		parseInt(window.getComputedStyle(list.dom, "").getPropertyValue("padding-top"))	+
		        		parseInt(window.getComputedStyle(list.dom, "").getPropertyValue("padding-bottom"))
		        	);
		        }
			},
			mode: this.questionObj.questionType === "mc" ? 'MULTI' : 'SINGLE'
		});
		if (this.questionObj.abstention
				&& (this.questionObj.questionType === 'school'
					|| this.questionObj.questionType === 'vote'
					|| this.questionObj.questionType === 'abcd'
					|| this.questionObj.questionType === 'yesno')) {
			this.abstentionAnswer = this.answerList.getStore().add({
				id: this.abstentionInternalId,
				text: Messages.ABSTENTION,
				correct: false
			})[0];
		}
		
		this.mcSaveButton = Ext.create('Ext.Button', {
			flex: 1,
			ui: 'confirm',
			cls: 'login-button noMargin',
			text: Messages.SAVE,
			handler: !this.viewOnly ? this.saveMcQuestionHandler : function() {},
			scope: this,
			disabled: true
		});
		
		var mcContainer = {
			xtype: 'container',
			layout: {
				type: 'hbox',
				align: 'stretch'
			},
			defaults: {
				style: {
					margin: '10px'
				}
			},
			items: [this.mcSaveButton, !!!this.questionObj.abstention ? { hidden: true } : {
				flex: 1,
				xtype: 'button',
				cls: 'login-button noMargin',
				text: Messages.ABSTENTION,
				handler: this.mcAbstentionHandler,
				scope: this
			}]
		};
		
		var flashcardContainer = {
			xtype: 'button',
			cls: 'login-button',
			ui: 'confirm',
			text: Messages.SHOW_FLASHCARD_ANSWER,
			handler: function(button) {
				if (this.answerList.isHidden()) {
					this.answerList.show(true);
					button.setText(Messages.HIDE_FLASHCARD_ANSWER);
				} else {
					this.answerList.hide(true);
					button.setText(Messages.SHOW_FLASHCARD_ANSWER);
				}
			},
			scope: this
		};
		
		this.add([this.questionTitle]);
		if (this.questionObj.questionType === "flashcard") {
			this.add([flashcardContainer]);
			this.answerList.setHidden(true);
		} else {
			this.answerList.setHidden(false);
		}
		this.add([this.answerList].concat(
			this.questionObj.questionType === "mc" && !this.viewOnly ? mcContainer : {}
		));
		
		this.on('activate', function(){
			this.answerList.addListener('itemtap', questionListener.itemtap);
			/*
			 * Bugfix, because panel is normally disabled (isDisabled == true),
			 * but is not rendered as 'disabled'
			 */
			if(this.isDisabled()) this.disableQuestion();
		});
	},
	
	disableQuestion: function() {
		this.setDisabled(true);
		this.mask(Ext.create('ARSnova.view.CustomMask'));
	},
	
	selectAbstentionAnswer: function() {
		var index = this.answerList.getStore().indexOf(this.abstentionAnswer);
		if (index !== -1) {
			this.answerList.select(this.abstentionAnswer);
		}
	},
	
	doTypeset: function(parent) {
		if (typeof this.questionTitle.element !== "undefined") {
			var panel = this;
			MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.questionTitle.element.dom]);
			MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.answerList.element.dom]);
			
			MathJax.Hub.Queue(
				["Delay", MathJax.Callback, 700], function() {
					panel.answerList.fireEvent("resizeList", panel.answerList.element);
				}
			);
		} else {
			// If the element has not been drawn yet, we need to retry later
			Ext.defer(Ext.bind(this.doTypeset, this), 100);
		}
	},
	
	getUserAnswer: function() {
		var self = this;
		var promise = new RSVP.Promise();
		ARSnova.app.answerModel.getUserAnswer(self.questionObj._id, {
			empty: function() {
				var answer = Ext.create('ARSnova.model.Answer', {
					type	 	: "skill_question_answer",
					sessionId	: localStorage.getItem("sessionId"),
					questionId	: self.questionObj._id,
					user		: localStorage.getItem("login"),
					timestamp	: Date.now(),
					questionVariant: self.questionObj.questionVariant
				});
				promise.resolve(answer);
			},
			success: function(response){
				var theAnswer = Ext.decode(response.responseText);
				
				//update
				var answer = Ext.create('ARSnova.model.Answer', theAnswer);
				promise.resolve(answer);
			},
			failure: function(){
				console.log('server-side error');
				promise.reject();
			}
		});
		return promise;
	}
});
