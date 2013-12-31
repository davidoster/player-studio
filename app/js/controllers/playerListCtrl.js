'use strict';

/* Controllers */

KMCModule.controller('PlayerListCtrl',
    ['apiService', '$location', '$rootScope', '$scope', '$filter', '$modal', '$timeout', '$log', "$compile", "$window", 'localStorageService', 'requestNotificationChannel', 'PlayerService',
        function (apiService, $location, $rootScope, $scope, $filter, $modal, $timeout, $log, $compile, $window, localStorageService, requestNotificationChannel, PlayerService) {
            requestNotificationChannel.requestStarted('list');
            $rootScope.lang = 'en-US';
            $scope.search = '';
            $scope.searchSelect2Options = {};
            $scope.currentPage = 1;
            $scope.maxSize = 5;
            // get studio UICONF to setup studio configuration
            var request = {
                'filter:tagsMultiLikeOr': 'studio_v2',
                'filter:orderBy': '-updatedAt',
                'filter:objTypeEqual': '16',
                'filter:objectType': 'KalturaUiConfFilter',
                'filter:creationModeEqual': '3',
                'ignoreNull': '1',
                'page:objectType': 'KalturaFilterPager',
                'pager:pageIndex': '1',
                'pager:pageSize': '25',
                'service': 'uiConf',
                'action': 'list'
            };
            apiService.doRequest(request).then(function (data) {
                if (data.objects && data.objects.length == 1) {
                    $scope.UIConf = angular.fromJson(data.objects[0].config);
                } else {
                    $log.error('Error retrieving studio UICONF');
                }
            });
            // get players list from KMC
            var request = {
                'filter:tagsMultiLikeOr': 'kdp3,html5studio',
                'filter:orderBy': '-updatedAt',
                'filter:objTypeEqual': '1',
                'filter:objectType': 'KalturaUiConfFilter',
                'filter:creationModeEqual': '2',
                'ignoreNull': '1',
                'page:objectType': 'KalturaFilterPager',
                'pager:pageIndex': '1',
                'pager:pageSize': '999',
                'service': 'uiConf',
                'action': 'list'
            };
            apiService.doRequest(request).then(function (data) {
                $scope.data = data.objects;
                $scope.calculateTotalItems();
                PlayerService.cachePlayers(data.objects);
            });
            $scope.filtered = $filter('filter')($scope.data, $scope.search) || [];
            $scope.requiredVersion = PlayerService.getRequiredVersion();
            $scope.calculateTotalItems = function () {
                if ($scope.filtered)
                    $scope.totalItems = $scope.filtered.length;
                else if ($scope.data) {
                    $scope.totalItems = $scope.data.length;
                    return $scope.totalItems;
                }
            };
            $scope.checkVersionNeedsUpgrade = function (item) {
                var html5libVersion = item.html5Url.substr(item.html5Url.indexOf('/v')+2, 1); // get html5 lib version number from its URL
                return (html5libVersion == "1" || item.config == null); // need to upgrade if the version is lower than 2 or the player doesn't have a config object
            }
            $scope.showSubTitle = true;
            $scope.getThumbnail = function (item) {
                if (typeof item.thumbnailUrl != 'undefined')
                    return item.thumbnailUrl; // TODO: prehaps some checking on the URL validity?
                else return $scope.defaultThumbnailUrl;
            };
            $scope.defaultThumbnailUrl = 'img/mockPlayerThumb.png';
            $scope.$watch('search', function (newValue, oldValue) {
                $scope.showSubTitle = newValue;
                if (newValue.length > 0) {
                    $scope.title = $filter('i18n')('search for') + ' "' + newValue + '"';
                }
                else {
                    if (oldValue)
                        $scope.title = $filter('i18n')('Players list');
                }

                $timeout(function () {
                    $scope.calculateTotalItems();
                }, 100);
            });
            $scope.oldVersionEditText = $filter('i18n')('Warning this player is out of date. \n' +
                'Saving changes to this player upgrade, some features and \n' +
                'design may be lost. (read more about upgrading players)');
            $scope.goToEditPage = function (item, $event) {
                $event.preventDefault();
                //TODO filter according to what? we don't have "version" field
                if (!$scope.checkVersionNeedsUpgrade(item)) {
                    $location.path('/edit/' + item.id);
                    return false;
                } else {
                    var msgText = $scope.oldVersionEditText;
                    var modal = $modal.open({
                        templateUrl: 'template/dialog/message.html',
                        controller: 'ModalInstanceCtrl',
                        resolve: {
                            settings: function () {
                                return {
                                    'title': 'Edit confirmation',
                                    'message': msgText
                                };
                            }
                        }
                    })
                    modal.result.then(function (result) {
                        if (result) { // here we should move though an upgrade process before reaching the edit.
                            return  $location.url('edit/' + item.id);
                        }

                    }, function () {
                        return $log.info('edit when outdated modal dismissed at: ' + new Date());
                    });
                }

            };
            $scope.newPlayer = function () {
                $location.path('/new');
            };
            $scope.duplicate = function (item) {
                var newclone = PlayerService.clonePlayer(item);
                newclone.then(function (data) {
                    $location.url('edit/' + data[1].id);
                });
//
                // $scope.data.splice($scope.data.indexOf(item) + 1, 0, item);
            };
            // TODO: preview action...
            $scope.deletePlayer = function (item) {
                var modal = $modal.open({
                    templateUrl: 'template/dialog/message.html',
                    controller: 'ModalInstanceCtrl',
                    resolve: {
                        settings: function () {
                            return {
                                'title': 'Delete confirmation',
                                'message': 'Are you sure you want to delete the player?'
                            };
                        }
                    }
                });
                modal.result.then(function (result) {
                    if (result)
                        PlayerService.deletePlayer(item.id).then(function () {
                            $scope.data.splice($scope.data.indexOf(item), 1);
                        }, function (reason) {
                            $modal.open({ templateUrl: 'template/dialog/message.html',
                                controller: 'ModalInstanceCtrl',
                                resolve: {
                                    settings: function () {
                                        return {
                                            'title': 'Delete failure',
                                            'message': reason
                                        };
                                    }
                                }
                            });
                        })
                }, function () {
                    $log.info('Delete modal dismissed at: ' + new Date());
                });
            };
            $scope.update = function (player) {
	            var currentVersion = player.html5Url.split("/v")[1].split("/")[0];
	            var text = '<span><b>' + $filter("i18n")("upgradeMsg") + '</b><br></br>'+$filter("i18n")("upgradeFromVersion") + currentVersion + '<br> ' + $filter("i18n")("upgradeToVersion")+ $scope.UIConf.html5_version.substr(1) + '</span>';
	            var html5lib = player.html5Url.substr(0,player.html5Url.indexOf('/v')+2)+window.MWEMBED_VERSION+"/mwEmbedLoader.php";
	            var modal = $modal.open({
		            templateUrl: 'template/dialog/message.html',
		            controller: 'ModalInstanceCtrl',
		            resolve: {
			            settings: function () {
				            return {
					            'title': 'Update confirmation',
					            'message': text
				            };
			            }
		            }
	            });
	            modal.result.then(function (result) {
		            if (result)
			            PlayerService.playerUpdate(player, html5lib).then(function (data) {
				            // update local data (we will not retrieve from the server again)
				            player.config = angular.toJson(data);
				            player.html5Url = html5lib;
				            player.tags = 'html5studio,player';
			            }, function (reason) {
				            $modal.open({ templateUrl: 'template/dialog/message.html',
					            controller: 'ModalInstanceCtrl',
					            resolve: {
						            settings: function () {
							            return {
								            'title': 'Update player failure',
								            'message': reason
							            };
						            }
					            }
				            });
			            })
	            }, function () {
		            $log.info('Update player dismissed at: ' + new Date());
	            });
            };
        }
    ])
;